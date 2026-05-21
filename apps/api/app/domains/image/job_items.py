from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from apps.api.app.core.errors import AppError
from apps.api.app.domains.image.asset_deletion import delete_asset_objects
from apps.api.app.domains.image.job_failure import NON_RETRYABLE_ERROR_CODES
from apps.api.app.domains.image.job_recovery import IMAGE_JOB_RETRY_ERROR_CODE
from apps.api.app.domains.image.models import Asset, ImageJob, ImageJobItem, ImageJobResult
from apps.api.app.infra.storage.asset_storage import AssetStorage
from apps.api.app.infra.storage.factory import build_asset_storage

IMAGE_JOB_ITEM_FAILED_ERROR_CODE = "image_job_failed"


@dataclass(frozen=True)
class ItemStatusCounts:
    total: int
    queued: int
    running: int
    succeeded: int
    failed: int
    max_attempt_count: int


def create_job_items(session: Session, *, job: ImageJob) -> None:
    available_at = job.available_at or datetime.utcnow()
    for result_index in range(1, job.requested_count + 1):
        session.add(ImageJobItem(
            job_id=job.id,
            result_index=result_index,
            status="queued",
            max_attempts=job.max_attempts,
            available_at=available_at,
        ))
    session.flush()


def get_job_item(session: Session, item_id: int) -> ImageJobItem:
    item = session.get(ImageJobItem, item_id)
    if item is None:
        raise AppError(code="image_job_item_not_found", message="image job item not found", status_code=404)
    return item


def clear_item_output(
    session: Session,
    *,
    job_id: int,
    result_index: int,
    storage: AssetStorage | None = None,
) -> None:
    result = session.execute(
        select(ImageJobResult)
        .where(ImageJobResult.job_id == job_id, ImageJobResult.result_index == result_index)
    ).scalar_one_or_none()
    if result is None:
        return
    session.execute(update(ImageJobItem).where(ImageJobItem.asset_id == result.asset_id).values(asset_id=None))
    session.delete(result)
    delete_output_asset(session, asset_id=result.asset_id, storage=storage)
    session.flush()


def delete_output_asset(session: Session, *, asset_id: int, storage: AssetStorage | None = None) -> None:
    asset = session.get(Asset, asset_id)
    if asset is None:
        return
    delete_asset_objects(asset, storage or build_asset_storage())
    session.delete(asset)


def mark_item_succeeded(session: Session, *, item: ImageJobItem, asset_id: int) -> None:
    finished_at = datetime.utcnow()
    item.status = "succeeded"
    item.asset_id = asset_id
    item.finished_at = finished_at
    item.available_at = finished_at
    item.error_code = None
    item.error_message = None
    clear_item_lock(item)
    aggregate_parent_job_status(session, job_id=item.job_id)


def handle_item_failure(
    session: Session,
    *,
    item: ImageJobItem,
    exc: Exception,
    retry_delay_seconds: int,
) -> None:
    message = str(exc)
    if is_terminal_item_failure(item=item, exc=exc):
        mark_item_failed(session, item=item, error_message=message)
        return
    retry_at = datetime.utcnow() + timedelta(seconds=retry_delay_seconds)
    item.status = "queued"
    item.error_code = IMAGE_JOB_RETRY_ERROR_CODE
    item.error_message = message
    item.last_error_code = IMAGE_JOB_RETRY_ERROR_CODE
    item.last_error_message = message
    item.dead_letter_at = None
    item.available_at = retry_at
    item.finished_at = None
    clear_item_lock(item)
    aggregate_parent_job_status(session, job_id=item.job_id)


def is_terminal_item_failure(*, item: ImageJobItem, exc: Exception) -> bool:
    error_code = getattr(exc, "code", None)
    return error_code in NON_RETRYABLE_ERROR_CODES or item.attempt_count >= item.max_attempts


def mark_item_failed(session: Session, *, item: ImageJobItem, error_message: str) -> None:
    finished_at = datetime.utcnow()
    item.status = "failed"
    item.error_code = IMAGE_JOB_ITEM_FAILED_ERROR_CODE
    item.error_message = error_message
    item.last_error_code = IMAGE_JOB_ITEM_FAILED_ERROR_CODE
    item.last_error_message = error_message
    item.dead_letter_at = finished_at
    item.available_at = finished_at
    item.finished_at = finished_at
    clear_item_lock(item)
    aggregate_parent_job_status(session, job_id=item.job_id)


def aggregate_parent_job_status(session: Session, *, job_id: int) -> None:
    session.flush()
    job = session.get(ImageJob, job_id)
    if job is None:
        return
    counts = load_item_status_counts(session, job_id=job_id)
    if counts.total == 0:
        return
    job.attempt_count = counts.max_attempt_count
    if counts.running > 0:
        mark_parent_running(job)
    elif counts.succeeded == counts.total:
        mark_parent_succeeded(job)
    elif counts.failed > 0 and counts.succeeded + counts.failed == counts.total:
        mark_parent_failed(session, job=job)
    else:
        mark_parent_queued(session, job=job)
    session.flush()


def load_item_status_counts(session: Session, *, job_id: int) -> ItemStatusCounts:
    statement = (
        select(ImageJobItem.status, func.count(ImageJobItem.id), func.max(ImageJobItem.attempt_count))
        .where(ImageJobItem.job_id == job_id)
        .group_by(ImageJobItem.status)
    )
    counts = {"queued": 0, "running": 0, "succeeded": 0, "failed": 0}
    max_attempt = 0
    for status, count, attempt_count in session.execute(statement):
        counts[str(status)] = int(count)
        max_attempt = max(max_attempt, int(attempt_count or 0))
    return ItemStatusCounts(sum(counts.values()), counts["queued"], counts["running"], counts["succeeded"], counts["failed"], max_attempt)


def mark_parent_running(job: ImageJob) -> None:
    now = datetime.utcnow()
    job.status = "running"
    job.started_at = job.started_at or now
    job.finished_at = None
    job.error_code = None
    job.error_message = None


def mark_parent_succeeded(job: ImageJob) -> None:
    now = datetime.utcnow()
    job.status = "succeeded"
    job.available_at = now
    job.finished_at = now
    job.error_code = None
    job.error_message = None


def mark_parent_failed(session: Session, *, job: ImageJob) -> None:
    now = datetime.utcnow()
    job.status = "failed"
    job.error_code = IMAGE_JOB_ITEM_FAILED_ERROR_CODE
    job.error_message = load_failed_item_message(session, job_id=job.id)
    job.available_at = now
    job.finished_at = now


def load_failed_item_message(session: Session, *, job_id: int) -> str | None:
    return session.execute(
        select(ImageJobItem.error_message)
        .where(ImageJobItem.job_id == job_id, ImageJobItem.status == "failed")
        .order_by(ImageJobItem.result_index.asc())
    ).scalar_one_or_none()


def mark_parent_queued(session: Session, *, job: ImageJob) -> None:
    job.status = "queued"
    job.error_code, job.error_message = load_retry_item_error(session, job_id=job.id)
    job.finished_at = None


def load_retry_item_error(session: Session, *, job_id: int) -> tuple[str | None, str | None]:
    row = session.execute(
        select(ImageJobItem.error_code, ImageJobItem.error_message)
        .where(
            ImageJobItem.job_id == job_id,
            ImageJobItem.status == "queued",
            ImageJobItem.error_code.is_not(None),
        )
        .order_by(ImageJobItem.result_index.asc())
    ).first()
    return (row[0], row[1]) if row is not None else (None, None)


def clear_item_lock(item: ImageJobItem) -> None:
    item.locked_by = None
    item.locked_at = None
    item.heartbeat_at = None
    item.lease_expires_at = None
