from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from apps.api.app.core.deps import get_db_session
from apps.api.app.core.response import api_ok
from apps.api.app.domains.auth.service import require_admin
from apps.api.app.domains.ops.service import build_worker_summary

admin_router = APIRouter(prefix="/ops", tags=["ops-admin"])


@admin_router.get("/worker-summary")
def get_worker_summary(request: Request, session: Session = Depends(get_db_session)):
    require_admin(request, session)
    return api_ok(build_worker_summary(session))
