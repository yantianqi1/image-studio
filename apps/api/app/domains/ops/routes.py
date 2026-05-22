from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.orm import Session

from apps.api.app.core.cache import app_cache
from apps.api.app.core.deps import get_db_session
from apps.api.app.core.response import api_ok
from apps.api.app.domains.auth.service import require_admin
from apps.api.app.domains.ops.service import (
    build_image_queue_summary,
    build_worker_summary,
    drain_worker_node,
    list_running_image_items,
    list_worker_nodes,
    resume_worker_node,
)

admin_router = APIRouter(prefix="/ops", tags=["ops-admin"])


@admin_router.get("/worker-summary")
def get_worker_summary(request: Request, response: Response, session: Session = Depends(get_db_session)):
    require_admin(request, session)
    cached = app_cache.get("admin:worker_summary")
    if cached is not None:
        response.headers["Cache-Control"] = "private, max-age=5"
        return api_ok(cached)
    summary = build_worker_summary(session)
    app_cache.set("admin:worker_summary", summary, ttl_seconds=15)
    response.headers["Cache-Control"] = "private, max-age=5"
    return api_ok(summary)


@admin_router.get("/workers")
def list_workers(request: Request, session: Session = Depends(get_db_session)):
    require_admin(request, session)
    return api_ok({"items": list_worker_nodes(session)})


@admin_router.get("/image/queue-summary")
def get_image_queue_summary(request: Request, session: Session = Depends(get_db_session)):
    require_admin(request, session)
    return api_ok(build_image_queue_summary(session))


@admin_router.get("/image/running-items")
def get_running_image_items(request: Request, session: Session = Depends(get_db_session)):
    require_admin(request, session)
    return api_ok({"items": list_running_image_items(session)})


@admin_router.post("/workers/{worker_id}/drain")
def drain_worker(worker_id: str, request: Request, session: Session = Depends(get_db_session)):
    require_admin(request, session)
    app_cache.invalidate("admin:worker_summary")
    return api_ok(drain_worker_node(session, worker_id=worker_id))


@admin_router.post("/workers/{worker_id}/resume")
def resume_worker(worker_id: str, request: Request, session: Session = Depends(get_db_session)):
    require_admin(request, session)
    app_cache.invalidate("admin:worker_summary")
    return api_ok(resume_worker_node(session, worker_id=worker_id))
