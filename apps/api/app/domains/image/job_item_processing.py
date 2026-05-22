from __future__ import annotations

from sqlalchemy.orm import Session

from apps.api.app.core.errors import AppError
from apps.api.app.domains.image.assets import ensure_thumbnail_exists, persist_rendered_asset
from apps.api.app.domains.image.client_provider_rendering import (
    resolve_job_client_provider_config,
    resolve_render_client_provider_config,
)
from apps.api.app.domains.image.gallery import set_asset_visibility
from apps.api.app.domains.image.job_items import (
    clear_item_output,
    get_job_item,
    handle_item_failure,
    mark_item_succeeded,
)
from apps.api.app.domains.image.models import ImageJob, ImageJobItem
from apps.api.app.domains.image.provider_usage import record_rendered_usage
from apps.api.app.domains.image.repository import get_job, list_reference_asset_ids
from apps.api.app.infra.storage.asset_storage import AssetStorage
from apps.api.app.infra.storage.factory import build_asset_storage


def process_claimed_item(
    session: Session,
    *,
    item_id: int,
    retry_delay_seconds: int,
) -> ImageJob:
    item = get_job_item(session, item_id)
    if item.status != "running":
        raise AppError(code="image_job_item_not_running", message="image job item is not running", status_code=409)
    job = get_job(session, item.job_id)
    storage = build_asset_storage()
    clear_item_output(session, job_id=job.id, result_index=item.result_index, storage=storage)
    try:
        asset_id = render_item(session, job=job, item=item, storage=storage)
        mark_item_succeeded(session, item=item, asset_id=asset_id)
    except Exception as exc:
        clear_item_output(session, job_id=job.id, result_index=item.result_index, storage=storage)
        handle_item_failure(session, item=item, exc=exc, retry_delay_seconds=retry_delay_seconds)
    session.flush()
    return job


def render_item(
    session: Session,
    *,
    job: ImageJob,
    item: ImageJobItem,
    storage: AssetStorage,
) -> int:
    from apps.api.app.domains.image import service as image_service

    reference_asset_ids = list_reference_asset_ids(session, job_id=job.id)
    client_config = resolve_render_client_provider_config(
        session=session,
        job=job,
        client_config=resolve_job_client_provider_config(job),
    )
    rendered = image_service.render_job_image(
        session,
        job=job,
        reference_asset_ids=reference_asset_ids,
        client_config=client_config,
    )
    record_rendered_usage(session, job=job, item_id=item.id, usage=rendered.usage)
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
    image_service.add_job_result(session, job=job, result_index=item.result_index, asset_id=asset.id, rendered=rendered)
    return asset.id
