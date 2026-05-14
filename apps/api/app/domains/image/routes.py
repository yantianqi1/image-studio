from fastapi import APIRouter, Depends, File, Query, Request, Response, UploadFile, status
from sqlalchemy.orm import Session

from apps.api.app.core.deps import get_db_session
from apps.api.app.core.response import api_ok
from apps.api.app.domains.auth.ownership import ensure_anonymous_owner, resolve_request_owner
from apps.api.app.domains.auth.service import require_admin
from apps.api.app.domains.image.admin_service import list_admin_jobs_with_results
from apps.api.app.domains.image.stats_service import get_image_job_stats
from apps.api.app.domains.image.assets import (
    persist_uploaded_asset,
    resolve_asset_content,
    resolve_asset_public_urls,
    resolve_thumbnail_content,
)
from apps.api.app.domains.image.gallery import (
    delete_asset_by_admin,
    delete_owned_asset,
    get_asset_for_read,
    list_admin_gallery_items,
    list_gallery_items,
    load_assets_by_id,
    set_asset_visibility,
    update_owned_asset_visibility,
)
from apps.api.app.domains.image.schemas import CreateImageJobRequest, UpdateAssetVisibilityRequest
from apps.api.app.domains.image.service import (
    create_job,
    delete_job,
    get_asset,
    get_job_for_owner,
    list_job_results_for_owner,
    list_jobs_for_owner,
)
from apps.api.app.domains.llm.client_provider import CLIENT_PROVIDER_SOURCE, read_client_provider_config
from apps.api.app.domains.public_quota.constants import PUBLIC_QUOTA_FEATURE_IMAGE
from apps.api.app.domains.public_quota.service import consume_public_quota, resolve_request_ip
from apps.api.app.domains.settings.service import require_anonymous_image_enabled, require_uploads_enabled
from apps.api.app.infra.storage.factory import build_asset_storage

public_router = APIRouter(prefix="/image", tags=["image-public"])
admin_router = APIRouter(tags=["image-admin"])


@public_router.post("/jobs", status_code=status.HTTP_201_CREATED)
def create_image_job(
    payload: CreateImageJobRequest,
    request: Request,
    response: Response,
    session: Session = Depends(get_db_session),
):
    owner = ensure_anonymous_owner(request, response, session)
    client_config = read_client_provider_config(request)
    if owner.user_id is None and client_config is None:
        require_anonymous_image_enabled(session)
    if payload.mode == "edit" or payload.reference_asset_ids:
        require_uploads_enabled(session)
    job = create_job(
        session,
        owner=owner,
        source=resolve_image_job_source(owner=owner, has_client_provider=client_config is not None),
        prompt=payload.prompt,
        model_code=payload.model_code,
        requested_count=payload.requested_count,
        mode=payload.mode,
        source_asset_id=payload.source_asset_id,
        reference_asset_ids=payload.reference_asset_ids,
        client_access_id=client_config.client_id if owner.user_id is None and client_config else None,
        client_provider_config=client_config if owner.user_id is None else None,
        visibility=payload.visibility,
        size=payload.size,
        quality=payload.quality,
    )
    if should_consume_public_quota(owner=owner, has_client_provider=client_config is not None):
        consume_public_quota(
            session,
            request_ip=resolve_request_ip(request),
            feature=PUBLIC_QUOTA_FEATURE_IMAGE,
            reference_type="image_job",
            reference_id=str(job.id),
        )
    session.commit()
    return api_ok(job_payload(job))


@public_router.get("/gallery")
def get_image_gallery(
    request: Request,
    response: Response,
    scope: str = Query(default="mine"),
    session: Session = Depends(get_db_session),
):
    owner = resolve_gallery_owner(request=request, response=response, session=session, scope=scope)
    storage = build_asset_storage()
    items = list_gallery_items(session, owner=owner, scope=scope)
    return api_ok([gallery_item_payload(result, job=job, asset=asset, storage=storage) for result, job, asset in items])


@public_router.get("/jobs")
def get_my_image_jobs(request: Request, response: Response, session: Session = Depends(get_db_session)):
    owner = ensure_anonymous_owner(request, response, session)
    return api_ok([
        job_payload(job)
        for job in list_jobs_for_owner(session, owner)
    ])


@public_router.get("/jobs/{job_id}")
def get_image_job(job_id: int, request: Request, session: Session = Depends(get_db_session)):
    return api_ok(job_payload(get_job_for_owner(session, job_id, resolve_request_owner(request, session))))


@public_router.get("/jobs/{job_id}/results")
def get_image_results(job_id: int, request: Request, session: Session = Depends(get_db_session)):
    results = list_job_results_for_owner(session, job_id, resolve_request_owner(request, session))
    assets_by_id = load_assets_by_id(session, [item.asset_id for item in results])
    storage = build_asset_storage()
    return api_ok([result_payload(item, asset=assets_by_id.get(item.asset_id), storage=storage) for item in results])


@public_router.delete("/jobs/{job_id}")
def delete_image_job(job_id: int, request: Request, session: Session = Depends(get_db_session)):
    owner = resolve_request_owner(request, session)
    result = delete_job(session, job_id=job_id, owner=owner)
    session.commit()
    return api_ok(result)


ASSET_CACHE_HEADERS = {"Cache-Control": "public, max-age=86400, s-maxage=604800", "CDN-Cache-Control": "public, max-age=604800"}


@public_router.get("/assets/{asset_id}")
def get_image_asset(asset_id: int, request: Request, session: Session = Depends(get_db_session)):
    asset = get_asset_for_read(session, asset_id, resolve_request_owner(request, session))
    content, media_type = resolve_asset_content(asset, build_asset_storage())
    return Response(content=content, media_type=media_type, headers=ASSET_CACHE_HEADERS)


@public_router.get("/assets/{asset_id}/thumbnail")
def get_image_asset_thumbnail(asset_id: int, request: Request, session: Session = Depends(get_db_session)):
    asset = get_asset_for_read(session, asset_id, resolve_request_owner(request, session))
    content, media_type = resolve_thumbnail_content(asset, build_asset_storage())
    return Response(content=content, media_type=media_type, headers=ASSET_CACHE_HEADERS)


@public_router.patch("/assets/{asset_id}/visibility")
def update_image_asset_visibility(
    asset_id: int,
    payload: UpdateAssetVisibilityRequest,
    request: Request,
    session: Session = Depends(get_db_session),
):
    asset = update_owned_asset_visibility(session, asset_id=asset_id, owner=resolve_request_owner(request, session), visibility=payload.visibility)
    session.commit()
    return api_ok(asset_payload(asset, storage=build_asset_storage()))


@public_router.delete("/assets/{asset_id}")
def delete_image_asset(
    asset_id: int,
    request: Request,
    session: Session = Depends(get_db_session),
):
    owner = resolve_request_owner(request, session)
    delete_owned_asset(session, asset_id=asset_id, owner=owner)
    session.commit()
    return api_ok({"deleted": True, "asset_id": asset_id})


@public_router.post("/uploads", status_code=status.HTTP_201_CREATED)
async def upload_image_asset(
    request: Request,
    response: Response,
    file: UploadFile = File(...),
    session: Session = Depends(get_db_session),
):
    require_uploads_enabled(session)
    owner = ensure_anonymous_owner(request, response, session)
    client_config = read_client_provider_config(request)
    asset = persist_uploaded_asset(
        session,
        storage=build_asset_storage(),
        content=await file.read(),
        filename=file.filename,
        mime_type=file.content_type,
        user_id=owner.user_id,
        anonymous_session_id=owner.anonymous_session_id,
        client_id=client_config.client_id if owner.user_id is None and client_config else None,
    )
    session.commit()
    return api_ok(upload_payload(asset))


def resolve_image_job_source(*, owner, has_client_provider: bool) -> str:
    if owner.user_id is not None:
        return "member"
    if has_client_provider:
        return CLIENT_PROVIDER_SOURCE
    return "anonymous"


def should_consume_public_quota(*, owner, has_client_provider: bool) -> bool:
    return owner.user_id is None and not has_client_provider


def resolve_gallery_owner(*, request: Request, response: Response, session: Session, scope: str):
    if scope == "mine":
        return ensure_anonymous_owner(request, response, session)
    return resolve_request_owner(request, session)


@admin_router.get("/image-tasks")
@admin_router.get("/image/jobs")
def get_admin_jobs(
    request: Request,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    status: str = Query(default=""),
    paginated: int = Query(default=0),
    session: Session = Depends(get_db_session),
):
    require_admin(request, session)
    if paginated:
        from apps.api.app.domains.image.admin_service import list_admin_jobs_paginated
        result = list_admin_jobs_paginated(
            session, page=page, page_size=page_size, status=status or None
        )
        return api_ok({
            "items": [admin_job_payload(job, results=results) for job, results in result["items"]],
            "total": result["total"],
            "page": result["page"],
            "page_size": result["page_size"],
        })
    return api_ok([
        admin_job_payload(job, results=results)
        for job, results in list_admin_jobs_with_results(session)
    ])


@admin_router.get("/image/stats")
def get_image_stats(request: Request, response: Response, session: Session = Depends(get_db_session)):
    require_admin(request, session)
    from apps.api.app.core.cache import app_cache
    cached = app_cache.get("admin:image_stats")
    if cached is not None:
        response.headers["Cache-Control"] = "private, max-age=10"
        return api_ok(cached)
    stats = get_image_job_stats(session)
    app_cache.set("admin:image_stats", stats, ttl_seconds=60)
    response.headers["Cache-Control"] = "private, max-age=10"
    return api_ok(stats)


@admin_router.get("/image/assets/{asset_id}")
def get_admin_image_asset(asset_id: int, request: Request, session: Session = Depends(get_db_session)):
    require_admin(request, session)
    asset = get_asset(session, asset_id)
    content, media_type = resolve_asset_content(asset, build_asset_storage())
    return Response(content=content, media_type=media_type)


@admin_router.get("/gallery")
def get_admin_gallery(
    request: Request,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=100),
    q: str = Query(default=""),
    session: Session = Depends(get_db_session),
):
    require_admin(request, session)
    storage = build_asset_storage()
    items, total = list_admin_gallery_items(session, page=page, page_size=page_size, query=q or None)
    return api_ok({
        "items": [admin_gallery_item_payload(result, job=job, asset=asset, storage=storage) for result, job, asset in items],
        "total": total,
        "page": page,
        "page_size": page_size,
    })


@admin_router.patch("/image/assets/{asset_id}/visibility")
def admin_update_asset_visibility(
    asset_id: int,
    payload: UpdateAssetVisibilityRequest,
    request: Request,
    session: Session = Depends(get_db_session),
):
    require_admin(request, session)
    asset = get_asset(session, asset_id)
    set_asset_visibility(asset, payload.visibility)
    session.flush()
    session.commit()
    return api_ok(asset_payload(asset, storage=build_asset_storage()))


@admin_router.delete("/image/assets/{asset_id}")
def admin_delete_asset(
    asset_id: int,
    request: Request,
    session: Session = Depends(get_db_session),
):
    require_admin(request, session)
    delete_asset_by_admin(session, asset_id=asset_id)
    session.commit()
    return api_ok({"deleted": True, "asset_id": asset_id})


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
        "prompt": job.prompt,
        "model_code": job.model_code,
        "visibility": job.visibility,
        "source_asset_id": job.source_asset_id,
        "provider_id": job.provider_id,
        "provider_model": job.provider_model,
        "status": job.status,
        "requested_count": job.requested_count,
        "attempt_count": job.attempt_count,
        "max_attempts": job.max_attempts,
        "size": job.size,
        "quality": job.quality,
        "charge_cents": job.charge_cents,
        "error_code": job.error_code,
        "error_message": job.error_message,
        "created_at": job.created_at.isoformat(),
        "available_at": job.available_at.isoformat(),
        "started_at": job.started_at.isoformat() if job.started_at else None,
        "finished_at": job.finished_at.isoformat() if job.finished_at else None,
    }


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
