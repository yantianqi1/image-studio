from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from apps.api.app.core.errors import AppError
from apps.api.app.domains.auth.ownership import OwnerContext
from apps.api.app.domains.image.assets import ensure_thumbnail_exists, persist_rendered_asset
from apps.api.app.domains.image.gallery import normalize_asset_visibility, set_asset_visibility
from apps.api.app.domains.image.job_recovery import IMAGE_JOB_RETRY_ERROR_CODE, recover_stale_running_jobs
from apps.api.app.domains.image.models import ImageJob
from apps.api.app.domains.image.repository import (
    build_reservation,
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
    mark_job_failed,
    resolve_charge_cents,
    resolve_reference_assets,
    resolve_source_asset,
)
from apps.api.app.domains.llm.client_provider import (
    ClientProviderConfig,
    client_provider_config_from_mapping,
    serialize_client_provider_config,
)
from apps.api.app.domains.llm.service import (
    render_image,
    render_image_with_client_provider,
    resolve_model_execution_target,
    resolve_variant,
)
from apps.api.app.infra.storage.factory import build_asset_storage

IMAGE_JOB_MAX_ATTEMPTS = 3
IMAGE_JOB_RETRY_DELAY_SECONDS = 5
IMAGE_JOB_STALE_TIMEOUT_SECONDS = 300
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
    charge_cents = resolve_charge_cents(
        owner=owner,
        client_provider_config=client_provider_config,
        requested_count=requested_count,
        member_price_cents=variant.member_price_cents if variant else target.model.member_price_cents,
        anonymous_price_cents=variant.anonymous_price_cents if variant else target.model.anonymous_price_cents,
    )
    job = build_image_job(
        owner=owner,
        source=source,
        prompt=prompt,
        model_code=model_code,
        requested_count=requested_count,
        mode=mode,
        source_asset_id=source_asset.id if source_asset else None,
        provider_id=target.provider.id,
        provider_model=variant.upstream_provider_model if variant and variant.upstream_provider_model else target.provider_model,
        client_access_id=client_access_id,
        client_provider_config=serialize_client_provider_config(config=client_provider_config, provider_type=target.provider.type),
        storage_subdir=storage_subdir,
        visibility=visibility,
        size=size,
        quality=quality,
        charge_cents=charge_cents,
        reservation_id=build_reservation(session, owner=owner, charge_cents=charge_cents),
    )
    session.add(job)
    session.flush()
    create_reference_asset_rows(session, job_id=job.id, assets=reference_assets)
    return job


def build_image_job(
    *,
    owner: OwnerContext,
    source: str,
    prompt: str,
    model_code: str,
    requested_count: int,
    mode: str,
    source_asset_id: int | None,
    provider_id: int | None,
    provider_model: str | None,
    client_access_id: str | None,
    client_provider_config: dict[str, str] | None,
    storage_subdir: str | None,
    visibility: str,
    size: str | None,
    quality: str | None,
    charge_cents: int,
    reservation_id: int | None,
) -> ImageJob:
    return ImageJob(
        user_id=owner.user_id,
        anonymous_session_id=owner.anonymous_session_id,
        source=source,
        prompt=prompt,
        model_code=model_code,
        source_asset_id=source_asset_id,
        provider_id=provider_id,
        provider_model=provider_model,
        client_access_id=client_access_id,
        client_provider_config=client_provider_config,
        storage_subdir=storage_subdir,
        visibility=normalize_asset_visibility(visibility),
        requested_count=requested_count,
        mode=mode,
        size=size,
        quality=quality,
        charge_cents=charge_cents,
        reservation_id=reservation_id,
        max_attempts=IMAGE_JOB_MAX_ATTEMPTS,
        available_at=datetime.utcnow(),
    )


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
        handle_job_failure(session, job=job, exc=exc)
    session.flush()
    return job


def process_render_results(session: Session, *, job: ImageJob) -> None:
    storage = build_asset_storage()
    reference_asset_ids = list_reference_asset_ids(session, job_id=job.id)
    client_config = resolve_job_client_provider_config(job)
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


def render_with_client_provider(session: Session, *, config: ClientProviderConfig, options: dict[str, object]):
    source_asset_id = options.get("source_asset_id")
    reference_asset_ids = options.get("reference_asset_ids")
    return render_image_with_client_provider(
        session,
        config=config,
        prompt=str(options["prompt"]),
        model_code=str(options["model_code"]),
        provider_model=str(options.get("provider_model") or ""),
        source_asset_id=source_asset_id if isinstance(source_asset_id, int) else None,
        reference_asset_ids=reference_asset_ids if isinstance(reference_asset_ids, list) else [],
        size=str(options["size"]) if options.get("size") else None,
        quality=str(options["quality"]) if options.get("quality") else None,
    )


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


def resolve_job_client_provider_config(job: ImageJob) -> ClientProviderConfig | None:
    if not job.client_provider_config:
        return None
    return client_provider_config_from_mapping(job.client_provider_config)


NON_RETRYABLE_ERROR_CODES = frozenset({"provider_content_refused", "provider_api_key_missing", "provider_base_url_missing"})


def handle_job_failure(session: Session, *, job: ImageJob, exc: Exception) -> None:
    error_code = getattr(exc, "code", None)
    if error_code in NON_RETRYABLE_ERROR_CODES or job.attempt_count >= job.max_attempts:
        mark_job_failed(session, job=job, error_message=str(exc))
        return
    retry_at = datetime.utcnow() + timedelta(seconds=IMAGE_JOB_RETRY_DELAY_SECONDS)
    job.status = "queued"
    job.error_code = IMAGE_JOB_RETRY_ERROR_CODE
    job.error_message = str(exc)
    job.available_at = retry_at
    job.finished_at = None
    session.flush()
