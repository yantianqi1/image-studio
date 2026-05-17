from fastapi import APIRouter, Depends, Query, Request, Response
from sqlalchemy.orm import Session

from apps.api.app.core.cache import app_cache
from apps.api.app.core.deps import get_db_session
from apps.api.app.core.response import api_ok
from apps.api.app.domains.auth.service import require_admin
from apps.api.app.domains.image.admin_service import list_admin_jobs_paginated, list_admin_jobs_with_results
from apps.api.app.domains.image.assets import resolve_asset_content, resolve_thumbnail_content
from apps.api.app.domains.image.gallery import (
    delete_asset_by_admin,
    get_asset,
    list_admin_gallery_items,
    set_asset_visibility,
)
from apps.api.app.domains.image.payloads import (
    admin_gallery_item_payload,
    admin_job_payload,
    asset_payload,
)
from apps.api.app.domains.image.schemas import UpdateAssetVisibilityRequest
from apps.api.app.domains.image.stats_service import get_image_job_stats
from apps.api.app.infra.storage.factory import build_asset_storage

admin_router = APIRouter(tags=["image-admin"])

ADMIN_ASSET_CACHE_HEADERS = {"Cache-Control": "private, max-age=86400"}


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
        result = list_admin_jobs_paginated(session, page=page, page_size=page_size, status=status or None)
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
    return Response(content=content, media_type=media_type, headers=ADMIN_ASSET_CACHE_HEADERS)


@admin_router.get("/image/assets/{asset_id}/thumbnail")
def get_admin_image_asset_thumbnail(asset_id: int, request: Request, session: Session = Depends(get_db_session)):
    require_admin(request, session)
    asset = get_asset(session, asset_id)
    content, media_type = resolve_thumbnail_content(asset, build_asset_storage())
    return Response(content=content, media_type=media_type, headers=ADMIN_ASSET_CACHE_HEADERS)


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
