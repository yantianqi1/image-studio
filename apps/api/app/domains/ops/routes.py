from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.orm import Session

from apps.api.app.core.cache import app_cache
from apps.api.app.core.deps import get_db_session
from apps.api.app.core.response import api_ok
from apps.api.app.domains.auth.service import require_admin
from apps.api.app.domains.ops.service import build_worker_summary

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
