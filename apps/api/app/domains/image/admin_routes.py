from fastapi import APIRouter, Depends, Query, Request, Response
from sqlalchemy.orm import Session

from apps.api.app.core.cache import app_cache
from apps.api.app.core.deps import get_db_session
from apps.api.app.core.response import api_ok
from apps.api.app.domains.auth.service import require_admin
from apps.api.app.domains.audit.service import record_admin_ops_action
from apps.api.app.domains.image.admin_service import (
    cancel_image_job,
    cancel_image_job_item,
    list_admin_jobs_paginated,
    list_admin_jobs_with_results,
    list_dead_letter_items,
    pause_provider_runtime,
    retry_dead_letter_item,
    retry_image_job,
    resume_provider_runtime,
    update_job_priority,
)
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
from apps.api.app.domains.image.schemas import UpdateAssetVisibilityRequest, UpdateImageJobPriorityRequest
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


@admin_router.get("/image/dead-letter-items")
def get_dead_letter_items(request: Request, session: Session = Depends(get_db_session)):
    require_admin(request, session)
    return api_ok({"items": [dead_letter_payload(item, job) for item, job in list_dead_letter_items(session)]})


@admin_router.post("/image/items/{item_id}/retry")
def retry_image_job_item(item_id: int, request: Request, session: Session = Depends(get_db_session)):
    admin = require_admin(request, session)
    item = retry_dead_letter_item(session, item_id=item_id)
    record_image_admin_action(session, admin_id=admin.id, action="image.item.retry", item=item)
    session.commit()
    return api_ok({"item_id": item.id, "job_id": item.job_id, "status": item.status})


@admin_router.post("/image/items/{item_id}/cancel")
def cancel_image_item(item_id: int, request: Request, session: Session = Depends(get_db_session)):
    admin = require_admin(request, session)
    item = cancel_image_job_item(session, item_id=item_id)
    record_image_admin_action(session, admin_id=admin.id, action="image.item.cancel", item=item)
    session.commit()
    return api_ok({"item_id": item.id, "job_id": item.job_id, "status": item.status})


@admin_router.post("/image/jobs/{job_id}/retry")
def retry_admin_image_job(job_id: int, request: Request, session: Session = Depends(get_db_session)):
    admin = require_admin(request, session)
    result = retry_image_job(session, job_id=job_id)
    record_admin_ops_action(
        session,
        admin_user_id=admin.id,
        action="image.job.retry",
        target_type="image_job",
        target_id=job_id,
        metadata=result,
    )
    session.commit()
    return api_ok(result)


@admin_router.post("/image/jobs/{job_id}/cancel")
def cancel_admin_image_job(job_id: int, request: Request, session: Session = Depends(get_db_session)):
    admin = require_admin(request, session)
    result = cancel_image_job(session, job_id=job_id)
    record_admin_ops_action(
        session,
        admin_user_id=admin.id,
        action="image.job.cancel",
        target_type="image_job",
        target_id=job_id,
        metadata=result,
    )
    session.commit()
    return api_ok(result)


@admin_router.post("/image/providers/{provider_id}/pause")
def pause_image_provider(provider_id: int, request: Request, session: Session = Depends(get_db_session)):
    admin = require_admin(request, session)
    state = pause_provider_runtime(session, provider_id=provider_id)
    record_provider_admin_action(session, admin_id=admin.id, action="image.provider.pause", state=state)
    session.commit()
    return api_ok(provider_runtime_payload(state))


@admin_router.post("/image/providers/{provider_id}/resume")
def resume_image_provider(provider_id: int, request: Request, session: Session = Depends(get_db_session)):
    admin = require_admin(request, session)
    state = resume_provider_runtime(session, provider_id=provider_id)
    record_provider_admin_action(session, admin_id=admin.id, action="image.provider.resume", state=state)
    session.commit()
    return api_ok(provider_runtime_payload(state))


@admin_router.post("/image/jobs/{job_id}/priority")
def set_image_job_priority(
    job_id: int,
    payload: UpdateImageJobPriorityRequest,
    request: Request,
    session: Session = Depends(get_db_session),
):
    admin = require_admin(request, session)
    result = update_job_priority(session, job_id=job_id, priority=payload.priority)
    record_admin_ops_action(
        session,
        admin_user_id=admin.id,
        action="image.job.priority.update",
        target_type="image_job",
        target_id=job_id,
        metadata=result,
    )
    session.commit()
    return api_ok(result)


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


def dead_letter_payload(item, job) -> dict[str, object]:
    return {
        "item_id": item.id,
        "job_id": item.job_id,
        "result_index": item.result_index,
        "status": item.status,
        "priority": item.priority,
        "prompt": job.prompt,
        "model_code": job.model_code,
        "last_error_code": item.last_error_code,
        "last_error_message": item.last_error_message,
        "dead_letter_at": item.dead_letter_at.isoformat() if item.dead_letter_at else None,
        "manual_retry_count": item.manual_retry_count,
    }


def provider_runtime_payload(state) -> dict[str, object]:
    return {
        "provider_id": state.provider_id,
        "status": state.status,
        "failure_count": state.failure_count,
        "last_failure_at": state.last_failure_at.isoformat() if state.last_failure_at else None,
        "circuit_open_until": state.circuit_open_until.isoformat() if state.circuit_open_until else None,
        "updated_at": state.updated_at.isoformat() if state.updated_at else None,
    }


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
    admin = require_admin(request, session)
    asset = get_asset(session, asset_id)
    set_asset_visibility(asset, payload.visibility)
    session.flush()
    record_admin_ops_action(
        session,
        admin_user_id=admin.id,
        action="image.asset.visibility.update",
        target_type="image_asset",
        target_id=asset_id,
        metadata={"visibility": asset.visibility},
    )
    session.commit()
    return api_ok(asset_payload(asset, storage=build_asset_storage()))


@admin_router.delete("/image/assets/{asset_id}")
def admin_delete_asset(
    asset_id: int,
    request: Request,
    session: Session = Depends(get_db_session),
):
    admin = require_admin(request, session)
    delete_asset_by_admin(session, asset_id=asset_id)
    record_admin_ops_action(
        session,
        admin_user_id=admin.id,
        action="image.asset.delete",
        target_type="image_asset",
        target_id=asset_id,
        metadata={"deleted": True},
    )
    session.commit()
    return api_ok({"deleted": True, "asset_id": asset_id})


def record_image_admin_action(session: Session, *, admin_id: int, action: str, item) -> None:
    record_admin_ops_action(
        session,
        admin_user_id=admin_id,
        action=action,
        target_type="image_job_item",
        target_id=item.id,
        metadata={"job_id": item.job_id, "result_index": item.result_index, "status_to": item.status},
    )


def record_provider_admin_action(session: Session, *, admin_id: int, action: str, state) -> None:
    record_admin_ops_action(
        session,
        admin_user_id=admin_id,
        action=action,
        target_type="provider",
        target_id=state.provider_id,
        metadata={"status_to": state.status},
    )
