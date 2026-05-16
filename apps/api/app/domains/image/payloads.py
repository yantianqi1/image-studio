from apps.api.app.domains.billing.credits import cents_to_price_credits
from apps.api.app.domains.image.assets import resolve_asset_public_urls


def admin_job_payload(job, *, results) -> dict[str, object]:
    payload = job_payload(job)
    payload["results"] = [admin_result_payload(result) for result in results]
    return payload


def job_payload(job) -> dict[str, object]:
    return {
        "id": job.id,
        "user_id": job.user_id,
        "source": job.source,
        "mode": job.mode,
        "title": job.title,
        "prompt": job.prompt,
        "model_code": job.model_code,
        "visibility": job.visibility,
        "source_asset_id": job.source_asset_id,
        "provider_id": job.provider_id,
        "provider_model": job.provider_model,
        "client_provider_base_url": resolve_job_client_provider_base_url(job),
        "status": job.status,
        "requested_count": job.requested_count,
        "attempt_count": job.attempt_count,
        "max_attempts": job.max_attempts,
        "size": job.size,
        "quality": job.quality,
        "charge_cents": job.charge_cents,
        "charge_credits": cents_to_price_credits(job.charge_cents),
        "provider_input_tokens": job.provider_input_tokens,
        "provider_output_tokens": job.provider_output_tokens,
        "provider_total_tokens": job.provider_total_tokens,
        "raw_provider_cost_cents": job.raw_provider_cost_cents,
        "provider_fee_cents": job.provider_fee_cents,
        "internal_cost_cents": job.internal_cost_cents,
        "error_code": job.error_code,
        "error_message": job.error_message,
        "created_at": job.created_at.isoformat(),
        "available_at": job.available_at.isoformat(),
        "started_at": job.started_at.isoformat() if job.started_at else None,
        "finished_at": job.finished_at.isoformat() if job.finished_at else None,
    }


def resolve_job_client_provider_base_url(job) -> str | None:
    config = job.client_provider_config
    if not isinstance(config, dict):
        return None
    base_url = config.get("base_url")
    return base_url if isinstance(base_url, str) and base_url.strip() else None


ASSET_DOWNLOAD_EXTENSIONS = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/svg+xml": ".svg",
    "image/webp": ".webp",
}


def build_asset_download_disposition(asset_id: int, media_type: str) -> str:
    extension = ASSET_DOWNLOAD_EXTENSIONS.get(media_type.split(";")[0].strip().lower(), ".bin")
    return f'attachment; filename="generated-image-{asset_id}{extension}"'


def result_payload(result, *, asset=None, storage=None) -> dict[str, object]:
    payload = {
        "id": result.id,
        "job_id": result.job_id,
        "result_index": result.result_index,
        "asset_id": result.asset_id,
        "asset_url": result.asset_url,
        "revised_prompt": result.revised_prompt,
        "provider_request_id": result.provider_request_id,
    }
    if asset is not None:
        payload.update(asset_payload(asset, storage=storage))
    return payload


def admin_result_payload(result) -> dict[str, object]:
    payload = result_payload(result)
    payload["asset_url"] = f"/api/admin/image/assets/{result.asset_id}"
    return payload


def upload_payload(asset) -> dict[str, object]:
    return {
        "id": asset.id,
        "asset_url": f"/api/public/image/assets/{asset.id}",
        "storage_path": asset.storage_path,
        "mime_type": asset.mime_type,
        "created_at": asset.created_at.isoformat(),
    }


def asset_payload(asset, *, storage=None) -> dict[str, object]:
    if storage is not None:
        asset_url, thumbnail_url = resolve_asset_public_urls(asset, storage)
    else:
        asset_url = f"/api/public/image/assets/{asset.id}"
        thumbnail_url = f"/api/public/image/assets/{asset.id}/thumbnail"
    return {
        "asset_id": asset.id,
        "asset_url": asset_url,
        "thumbnail_url": thumbnail_url,
        "visibility": asset.visibility,
        "published_at": asset.published_at.isoformat() if asset.published_at else None,
        "created_at": asset.created_at.isoformat(),
    }


def gallery_item_payload(result, *, job, asset, storage=None) -> dict[str, object]:
    payload = asset_payload(asset, storage=storage)
    payload.update({
        "job_id": job.id,
        "result_index": result.result_index,
        "prompt": job.prompt,
        "revised_prompt": result.revised_prompt,
    })
    return payload


def admin_gallery_item_payload(result, *, job, asset, storage=None) -> dict[str, object]:
    payload = asset_payload(asset, storage=storage)
    payload.update({
        "job_id": job.id,
        "result_index": result.result_index,
        "prompt": job.prompt,
        "revised_prompt": result.revised_prompt,
        "owner_user_id": asset.owner_user_id,
        "owner_anonymous_session_id": asset.owner_anonymous_session_id,
    })
    return payload
