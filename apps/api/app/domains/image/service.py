from __future__ import annotations

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
from apps.api.app.domains.image.job_claiming import (
    DEFAULT_IMAGE_JOB_LEASE_SECONDS,
    DEFAULT_IMAGE_JOB_WORKER_NAME,
    POSTGRES_CLAIM_JOB_IDS_SQL,
    claim_next_job_ids as claim_next_job_ids_for_worker,
    heartbeat_job,
)
from apps.api.app.domains.image.job_failure import handle_job_failure
from apps.api.app.domains.image.job_item_claiming import (
    POSTGRES_CLAIM_ITEM_IDS_SQL,
    claim_next_item_ids as claim_next_item_ids_for_worker,
    heartbeat_item,
)
from apps.api.app.domains.image.job_items import create_job_items
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
from apps.api.app.domains.llm.rendering import ProviderUsage
from apps.api.app.domains.llm.service import (
    render_image,
    resolve_model_execution_target,
)
from apps.api.app.infra.storage.factory import build_asset_storage

IMAGE_JOB_RETRY_DELAY_SECONDS = 5
IMAGE_JOB_STALE_TIMEOUT_SECONDS = 300
IMAGE_JOB_MAX_ATTEMPTS = 3


def create_job(
    session: Session,
    *,
    owner: OwnerContext,
    source: str,
    title: str | None = None,
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
    source_asset = resolve_source_asset(session, mode=mode, source_asset_id=source_asset_id, owner=owner)
    reference_assets = resolve_reference_assets(session, reference_asset_ids=reference_asset_ids, owner=owner)
    normalized_messages = normalize_conversation_messages(conversation_messages)
    validate_conversation_message_assets(session, messages=normalized_messages, owner=owner)
    job = create_image_job_record(
        session=session,
        job_input=CreateImageJobRecordInput(
            owner=owner,
            source=source,
            title=title,
            prompt=prompt,
            model_code=model_code,
            requested_count=requested_count,
            mode=mode,
            source_asset_id=source_asset.id if source_asset else None,
            target=target,
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
    create_job_items(session, job=job)
    create_reference_asset_rows(session, job_id=job.id, assets=reference_assets)


def claim_next_job(
    session: Session,
    worker_name: str = DEFAULT_IMAGE_JOB_WORKER_NAME,
    lease_seconds: int = DEFAULT_IMAGE_JOB_LEASE_SECONDS,
) -> ImageJob | None:
    job_ids = claim_next_job_ids(session, limit=1, worker_name=worker_name, lease_seconds=lease_seconds)
    if not job_ids:
        return None
    return get_job(session, job_ids[0])


def claim_next_job_ids(
    session: Session,
    *,
    limit: int,
    worker_name: str = DEFAULT_IMAGE_JOB_WORKER_NAME,
    lease_seconds: int = DEFAULT_IMAGE_JOB_LEASE_SECONDS,
) -> list[int]:
    return claim_next_job_ids_for_worker(
        session,
        limit=limit,
        worker_name=worker_name,
        lease_seconds=lease_seconds,
        stale_timeout_seconds=IMAGE_JOB_STALE_TIMEOUT_SECONDS,
    )


def claim_next_item_ids(
    session: Session,
    *,
    limit: int,
    worker_name: str = DEFAULT_IMAGE_JOB_WORKER_NAME,
    lease_seconds: int = DEFAULT_IMAGE_JOB_LEASE_SECONDS,
) -> list[int]:
    return claim_next_item_ids_for_worker(
        session,
        limit=limit,
        worker_name=worker_name,
        lease_seconds=lease_seconds,
        stale_timeout_seconds=IMAGE_JOB_STALE_TIMEOUT_SECONDS,
    )


def process_claimed_item(session: Session, *, item_id: int) -> ImageJob:
    from apps.api.app.domains.image.job_item_processing import process_claimed_item as process_item

    return process_item(session, item_id=item_id, retry_delay_seconds=IMAGE_JOB_RETRY_DELAY_SECONDS)


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
        apply_rendered_usage(job, rendered.usage)
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


def apply_rendered_usage(job: ImageJob, usage: ProviderUsage | None) -> None:
    if usage is None:
        return
    job.provider_input_tokens = add_nullable_int(job.provider_input_tokens, usage.input_tokens)
    job.provider_output_tokens = add_nullable_int(job.provider_output_tokens, usage.output_tokens)
    job.provider_total_tokens = add_nullable_int(job.provider_total_tokens, usage.total_tokens)
    job.raw_provider_cost_cents = add_nullable_int(job.raw_provider_cost_cents, usage.raw_provider_cost_cents)
    job.provider_fee_cents = add_nullable_int(job.provider_fee_cents, usage.provider_fee_cents)
    job.internal_cost_cents = add_nullable_int(job.internal_cost_cents, usage.internal_cost_cents)
    job.provider_usage = append_usage_payload(existing=job.provider_usage, raw_payload=usage.raw_payload)


def add_nullable_int(existing: int | None, value: int | None) -> int | None:
    if value is None:
        return existing
    return (existing or 0) + value


def append_usage_payload(*, existing: object, raw_payload: dict[str, object] | None) -> dict[str, object] | None:
    if raw_payload is None:
        if existing is None or isinstance(existing, dict):
            return existing
        raise AppError(code="provider_usage_invalid", message="stored provider usage invalid", status_code=500)
    entries = extract_usage_entries(existing)
    return {"results": [*entries, raw_payload]}


def extract_usage_entries(existing: object) -> list[dict[str, object]]:
    if existing is None:
        return []
    if not isinstance(existing, dict):
        raise AppError(code="provider_usage_invalid", message="stored provider usage invalid", status_code=500)
    entries = existing.get("results")
    if not isinstance(entries, list):
        raise AppError(code="provider_usage_invalid", message="stored provider usage invalid", status_code=500)
    result: list[dict[str, object]] = []
    for entry in entries:
        if not isinstance(entry, dict):
            raise AppError(code="provider_usage_invalid", message="stored provider usage invalid", status_code=500)
        result.append(entry)
    return result


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
