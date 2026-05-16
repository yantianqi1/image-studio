from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta
import logging

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from apps.api.app.core.errors import AppError
from apps.api.app.domains.image.models import Asset, ImageAssetTag, ImageAssetTaggingJob, ImageJob, ImageJobResult
from apps.api.app.domains.image.tagging_llm import (
    GalleryTaggingContext,
    generate_gallery_tags,
    normalize_gallery_tag,
    normalize_generated_tags,
)
from apps.api.app.domains.llm.purpose_models import LLM_PURPOSE_GALLERY_TAGGING, resolve_llm_purpose_model_code

logger = logging.getLogger(__name__)

GALLERY_TAGGING_STATUS_PENDING = "pending"
GALLERY_TAGGING_STATUS_QUEUED = "queued"
GALLERY_TAGGING_STATUS_RUNNING = "running"
GALLERY_TAGGING_STATUS_SUCCEEDED = "succeeded"
GALLERY_TAGGING_STATUS_FAILED = "failed"
GALLERY_TAGGING_STALE_TIMEOUT_SECONDS = 300
GALLERY_TAGGING_ENQUEUE_BATCH_SIZE = 50
GALLERY_TAGGING_CLAIM_BATCH_SIZE = 10


@dataclass(frozen=True)
class GalleryTaggingState:
    tags: tuple[str, ...]
    status: str
    error_code: str | None = None
    error_message: str | None = None


def enqueue_missing_gallery_tagging_jobs(session: Session, *, limit: int = GALLERY_TAGGING_ENQUEUE_BATCH_SIZE) -> int:
    if limit < 1:
        return 0
    asset_ids = list(
        session.execute(
            select(ImageJobResult.asset_id)
            .outerjoin(ImageAssetTaggingJob, ImageAssetTaggingJob.asset_id == ImageJobResult.asset_id)
            .where(ImageAssetTaggingJob.id.is_(None))
            .order_by(ImageJobResult.id.asc())
            .limit(limit)
        ).scalars()
    )
    for asset_id in asset_ids:
        session.add(create_gallery_tagging_job(session, asset_id=asset_id))
    session.flush()
    return len(asset_ids)


def create_gallery_tagging_job(session: Session, *, asset_id: int) -> ImageAssetTaggingJob:
    model_code = resolve_llm_purpose_model_code(session, LLM_PURPOSE_GALLERY_TAGGING)
    return ImageAssetTaggingJob(
        asset_id=asset_id,
        status=GALLERY_TAGGING_STATUS_QUEUED,
        model_code=model_code,
        available_at=datetime.utcnow(),
    )


def claim_next_gallery_tagging_job(session: Session) -> ImageAssetTaggingJob | None:
    recover_stale_gallery_tagging_jobs(session)
    enqueue_missing_gallery_tagging_jobs(session)
    current_time = datetime.utcnow()
    job_ids = list(
        session.execute(
            select(ImageAssetTaggingJob.id)
            .where(
                ImageAssetTaggingJob.status == GALLERY_TAGGING_STATUS_QUEUED,
                ImageAssetTaggingJob.available_at <= current_time,
            )
            .order_by(ImageAssetTaggingJob.available_at.asc(), ImageAssetTaggingJob.id.asc())
            .limit(GALLERY_TAGGING_CLAIM_BATCH_SIZE)
        ).scalars()
    )
    for job_id in job_ids:
        if claim_gallery_tagging_job(session, job_id=job_id, current_time=current_time):
            return get_gallery_tagging_job(session, job_id)
    return None


def claim_gallery_tagging_job(session: Session, *, job_id: int, current_time: datetime) -> bool:
    statement = (
        update(ImageAssetTaggingJob)
        .where(
            ImageAssetTaggingJob.id == job_id,
            ImageAssetTaggingJob.status == GALLERY_TAGGING_STATUS_QUEUED,
            ImageAssetTaggingJob.available_at <= current_time,
        )
        .values(
            status=GALLERY_TAGGING_STATUS_RUNNING,
            attempt_count=ImageAssetTaggingJob.attempt_count + 1,
            started_at=current_time,
            finished_at=None,
            error_code=None,
            error_message=None,
        )
    )
    return session.execute(statement).rowcount > 0


def recover_stale_gallery_tagging_jobs(session: Session, *, stale_timeout_seconds: int = GALLERY_TAGGING_STALE_TIMEOUT_SECONDS) -> int:
    cutoff = datetime.utcnow() - timedelta(seconds=stale_timeout_seconds)
    current_time = datetime.utcnow()
    statement = (
        update(ImageAssetTaggingJob)
        .where(
            ImageAssetTaggingJob.status == GALLERY_TAGGING_STATUS_RUNNING,
            ImageAssetTaggingJob.started_at.is_not(None),
            ImageAssetTaggingJob.started_at < cutoff,
        )
        .values(
            status=GALLERY_TAGGING_STATUS_QUEUED,
            started_at=None,
            finished_at=None,
            error_code=None,
            error_message=None,
            available_at=current_time,
        )
    )
    result = session.execute(statement)
    session.flush()
    return result.rowcount or 0


def process_claimed_gallery_tagging_job(session: Session, *, job_id: int) -> ImageAssetTaggingJob:
    job = get_gallery_tagging_job(session, job_id)
    if job.status != GALLERY_TAGGING_STATUS_RUNNING:
        raise AppError(code="asset_tagging_job_not_running", message="asset tagging job is not running", status_code=409)
    try:
        context = load_gallery_tagging_context(session, asset_id=job.asset_id)
        result = generate_gallery_tags(session, context=context, model_code=job.model_code)
        replace_asset_tags(session, asset_id=job.asset_id, tags=result.tags)
        job.model_code = result.model_code
        job.provider_model = result.provider_model
        mark_gallery_tagging_job_succeeded(job)
    except Exception as exc:
        clear_asset_tags(session, asset_id=job.asset_id)
        mark_gallery_tagging_job_failed(job, exc)
        logger.exception("asset tagging job %s failed", job.id)
    session.flush()
    return job


def load_gallery_tagging_context(session: Session, *, asset_id: int) -> GalleryTaggingContext:
    statement = (
        select(ImageJob.prompt, ImageJobResult.revised_prompt)
        .join(ImageJob, ImageJob.id == ImageJobResult.job_id)
        .where(ImageJobResult.asset_id == asset_id)
        .order_by(ImageJobResult.id.desc())
        .limit(1)
    )
    row = session.execute(statement).first()
    if row is None:
        raise AppError(code="asset_tagging_context_missing", message="asset tagging context missing", status_code=404)
    asset = session.get(Asset, asset_id)
    if asset is None:
        raise AppError(code="asset_not_found", message="asset not found", status_code=404)
    prompt, revised_prompt = row
    return GalleryTaggingContext(asset=asset, prompt=prompt, revised_prompt=revised_prompt)


def get_gallery_tagging_job(session: Session, job_id: int) -> ImageAssetTaggingJob:
    job = session.get(ImageAssetTaggingJob, job_id)
    if job is None:
        raise AppError(code="asset_tagging_job_not_found", message="asset tagging job not found", status_code=404)
    return job


def replace_asset_tags(session: Session, *, asset_id: int, tags: Sequence[str]) -> None:
    clear_asset_tags(session, asset_id=asset_id)
    for sort_order, tag in enumerate(tags, start=1):
        normalized_tag = normalize_gallery_tag(tag)
        session.add(
            ImageAssetTag(
                asset_id=asset_id,
                tag=tag,
                normalized_tag=normalized_tag,
                sort_order=sort_order,
            )
        )


def clear_asset_tags(session: Session, *, asset_id: int) -> None:
    rows = list(session.execute(select(ImageAssetTag).where(ImageAssetTag.asset_id == asset_id)).scalars())
    for row in rows:
        session.delete(row)
    session.flush()


def delete_asset_tagging_state(session: Session, *, asset_ids: Sequence[int]) -> None:
    if not asset_ids:
        return
    for asset_id in asset_ids:
        clear_asset_tags(session, asset_id=asset_id)
        job = session.execute(select(ImageAssetTaggingJob).where(ImageAssetTaggingJob.asset_id == asset_id)).scalar_one_or_none()
        if job is not None:
            session.delete(job)
    session.flush()


def mark_gallery_tagging_job_succeeded(job: ImageAssetTaggingJob) -> None:
    finished_at = datetime.utcnow()
    job.status = GALLERY_TAGGING_STATUS_SUCCEEDED
    job.error_code = None
    job.error_message = None
    job.available_at = finished_at
    job.started_at = job.started_at or finished_at
    job.finished_at = finished_at


def mark_gallery_tagging_job_failed(job: ImageAssetTaggingJob, exc: Exception) -> None:
    finished_at = datetime.utcnow()
    job.status = GALLERY_TAGGING_STATUS_FAILED
    job.error_code = get_gallery_tagging_error_code(exc)
    job.error_message = get_gallery_tagging_error_message(exc)
    job.available_at = finished_at
    job.started_at = job.started_at or finished_at
    job.finished_at = finished_at


def get_gallery_tagging_error_code(exc: Exception) -> str:
    if isinstance(exc, AppError):
        return exc.code
    return "asset_tagging_failed"


def get_gallery_tagging_error_message(exc: Exception) -> str:
    if isinstance(exc, AppError):
        return exc.message
    return str(exc)


def load_asset_tagging_states(session: Session, asset_ids: Sequence[int]) -> dict[int, GalleryTaggingState]:
    if not asset_ids:
        return {}
    states = {asset_id: GalleryTaggingState(tags=(), status=GALLERY_TAGGING_STATUS_PENDING) for asset_id in asset_ids}
    job_rows = list(
        session.execute(
            select(ImageAssetTaggingJob).where(ImageAssetTaggingJob.asset_id.in_(asset_ids))
        ).scalars()
    )
    for job in job_rows:
        states[job.asset_id] = GalleryTaggingState(
            tags=states[job.asset_id].tags,
            status=job.status,
            error_code=job.error_code,
            error_message=job.error_message,
        )
    tag_rows = list(
        session.execute(
            select(ImageAssetTag)
            .where(ImageAssetTag.asset_id.in_(asset_ids))
            .order_by(ImageAssetTag.asset_id.asc(), ImageAssetTag.sort_order.asc())
        ).scalars()
    )
    tags_by_asset_id: dict[int, list[str]] = {asset_id: [] for asset_id in asset_ids}
    for tag in tag_rows:
        tags_by_asset_id.setdefault(tag.asset_id, []).append(tag.tag)
    for asset_id, tags in tags_by_asset_id.items():
        state = states[asset_id]
        next_status = state.status
        if next_status == GALLERY_TAGGING_STATUS_PENDING and tags:
            next_status = GALLERY_TAGGING_STATUS_SUCCEEDED
        states[asset_id] = GalleryTaggingState(
            tags=tuple(tags),
            status=next_status,
            error_code=state.error_code,
            error_message=state.error_message,
        )
    return states
