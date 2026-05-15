from __future__ import annotations

from datetime import datetime

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from apps.api.app.core.errors import AppError
from apps.api.app.domains.auth.ownership import OwnerContext
from apps.api.app.domains.image.assets import ensure_thumbnail_exists, persist_rendered_asset
from apps.api.app.domains.image.client_provider_rendering import (
    render_with_client_provider,
    resolve_job_client_provider_config,
    resolve_render_client_provider_config,
)
from apps.api.app.domains.image.conversation_messages import (
    normalize_conversation_messages,
    validate_conversation_message_assets,
)
from apps.api.app.domains.image.gallery import set_asset_visibility
from apps.api.app.domains.image.job_builder import CreateImageJobRecordInput, create_image_job_record
from apps.api.app.domains.image.job_failure import handle_job_failure
from apps.api.app.domains.image.job_recovery import recover_stale_running_jobs
from apps.api.app.domains.image.models import ImageJob
from apps.api.app.domains.image.repository import (
    clear_job_outputs,
    complete_job,
    create_reference_asset_rows,
    delete_job,
    get_asset,
    get_asset_for_owner,
    get_job,
    get_job_for_owner,
    list_job_results,
    list_job_results_for_owner,
    list_jobs,
    list_jobs_for_owner,
    list_reference_asset_ids,
    resolve_reference_assets,
    resolve_source_asset,
)
from apps.api.app.domains.llm.client_provider import ClientProviderConfig
from apps.api.app.domains.llm.service import (
    render_image,
    resolve_model_execution_target,
    resolve_variant,
)
from apps.api.app.infra.storage.factory import build_asset_storage

IMAGE_JOB_RETRY_DELAY_SECONDS = 5
IMAGE_JOB_STALE_TIMEOUT_SECONDS = 300
IMAGE_JOB_MAX_ATTEMPTS = 3
CLAIM_BATCH_SIZE = 10


def create_job(
    session: Session,
    *,
    owner: OwnerContext,
    source: str,
    prompt: str,
    model_code: str,
    requested_count: int,
    mode: str,
    source_asset_id: int | None = None,
    reference_asset_ids: list[int] | None = None,
    conversation_messages: list[dict] | None = None,
    client_access_id: str | None = None,
    client_provider_config: ClientProviderConfig | None = None,
    storage_subdir: str | None = None,
    visibility: str = "private",
    size: str | None = None,
    quality: str | None = None,
) -> ImageJob:
    target = resolve_model_execution_target(session, model_code=model_code)
    variant = resolve_variant(session, model_id=target.model.id, size=size, quality=quality)
    source_asset = resolve_source_asset(session, mode=mode, source_asset_id=source_asset_id, owner=owner)
    reference_assets = resolve_reference_assets(session, reference_asset_ids=reference_asset_ids, owner=owner)
    normalized_messages = normalize_conversation_messages(conversation_messages)
    validate_conversation_message_assets(session, messages=normalized_messages, owner=owner)
    job = create_image_job_record(
        session=session,
        job_input=CreateImageJobRecordInput(
            owner=owner,
            source=source,
            prompt=prompt,
            model_code=model_code,
            requested_count=requested_count,
            mode=mode,
            source_asset_id=source_asset.id if source_asset else None,
            target=target,
            variant=variant,
            client_access_id=client_access_id,
            client_provider_config=client_provider_config,
            conversation_messages=normalized_messages,
            storage_subdir=storage_subdir,
            visibility=visibility,
            size=size,
            quality=quality,
            image_input_count=len(reference_assets) + (1 if source_asset else 0),
            max_attempts=IMAGE_JOB_MAX_ATTEMPTS,
        ),
    )
    persist_new_image_job(session, job=job, reference_assets=reference_assets)
    return job


def persist_new_image_job(session: Session, *, job: ImageJob, reference_assets) -> None:
    session.add(job)
    session.flush()
    create_reference_asset_rows(session, job_id=job.id, assets=reference_assets)


def claim_next_job(session: Session) -> ImageJob | None:
    recover_stale_running_jobs(session, stale_timeout_seconds=IMAGE_JOB_STALE_TIMEOUT_SECONDS)
    current_time = datetime.utcnow()
    job_ids = list(
        session.execute(
            select(ImageJob.id)
            .where(ImageJob.status == "queued", ImageJob.available_at <= current_time)
            .order_by(ImageJob.available_at.asc(), ImageJob.id.asc())
            .limit(CLAIM_BATCH_SIZE)
        ).scalars()
    )
    for job_id in job_ids:
        if claim_job(session, job_id=job_id, current_time=current_time):
            return get_job(session, job_id)
    return None


def claim_job(session: Session, *, job_id: int, current_time: datetime) -> bool:
    statement = (
        update(ImageJob)
        .where(ImageJob.id == job_id, ImageJob.status == "queued", ImageJob.available_at <= current_time)
        .values(
            status="running",
            attempt_count=ImageJob.attempt_count + 1,
            started_at=current_time,
            finished_at=None,
            error_code=None,
            error_message=None,
        )
    )
    return session.execute(statement).rowcount > 0


def process_claimed_job(session: Session, *, job_id: int) -> ImageJob:
    job = get_job(session, job_id)
    if job.status != "running":
        raise AppError(code="image_job_not_running", message="image job is not running", status_code=409)
    clear_job_outputs(session, job_id=job.id)
    try:
        process_render_results(session, job=job)
        complete_job(session, job=job)
    except Exception as exc:
        clear_job_outputs(session, job_id=job.id)
        handle_job_failure(session, job=job, exc=exc, retry_delay_seconds=IMAGE_JOB_RETRY_DELAY_SECONDS)
    session.flush()
    return job


def process_render_results(session: Session, *, job: ImageJob) -> None:
    storage = build_asset_storage()
    reference_asset_ids = list_reference_asset_ids(session, job_id=job.id)
    client_config = resolve_render_client_provider_config(
        session=session,
        job=job,
        client_config=resolve_job_client_provider_config(job),
    )
    for result_index in range(1, job.requested_count + 1):
        rendered = render_job_image(session, job=job, reference_asset_ids=reference_asset_ids, client_config=client_config)
        asset = persist_rendered_asset(
            session,
            storage=storage,
            rendered=rendered,
            user_id=job.user_id,
            anonymous_session_id=job.anonymous_session_id,
            client_id=job.client_access_id,
            storage_subdir=job.storage_subdir,
        )
        ensure_thumbnail_exists(asset, storage)
        set_asset_visibility(asset, job.visibility)
        add_job_result(session, job=job, result_index=result_index, asset_id=asset.id, rendered=rendered)


def render_job_image(
    session: Session,
    *,
    job: ImageJob,
    reference_asset_ids: list[int],
    client_config: ClientProviderConfig | None,
):
    render_options = build_render_options(job=job, reference_asset_ids=reference_asset_ids)
    if client_config is None:
        return render_image(session, **render_options)
    return render_with_client_provider(session, config=client_config, options=render_options)


def build_render_options(*, job: ImageJob, reference_asset_ids: list[int]) -> dict[str, object]:
    options = {
        "prompt": job.prompt,
        "model_code": job.model_code,
        "provider_id": job.provider_id or 0,
        "provider_model": job.provider_model or "",
        "size": job.size,
        "quality": job.quality,
    }
    if job.source_asset_id is not None:
        options["source_asset_id"] = job.source_asset_id
    if reference_asset_ids:
        options["reference_asset_ids"] = reference_asset_ids
    if job.conversation_messages:
        options["conversation_messages"] = job.conversation_messages
    return options


def add_job_result(session: Session, *, job: ImageJob, result_index: int, asset_id: int, rendered) -> None:
    from apps.api.app.domains.image.models import ImageJobResult

    session.add(
        ImageJobResult(
            job_id=job.id,
            result_index=result_index,
            asset_id=asset_id,
            asset_url=f"/api/public/image/assets/{asset_id}",
            revised_prompt=rendered.revised_prompt,
            provider_request_id=rendered.provider_request_id,
        )
    )
    session.flush()
