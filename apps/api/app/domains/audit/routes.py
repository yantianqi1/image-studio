from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from apps.api.app.core.deps import get_db_session
from apps.api.app.core.response import api_ok
from apps.api.app.domains.auth.service import require_admin
from apps.api.app.domains.audit.schemas import AdminActionLogListOptions
from apps.api.app.domains.audit.service import audit_log_payload, list_admin_action_logs

admin_router = APIRouter(prefix="/audit-logs", tags=["admin-audit"])


@admin_router.get("")
def get_audit_logs(
    request: Request,
    options: AdminActionLogListOptions = Depends(),
    session: Session = Depends(get_db_session),
):
    require_admin(request, session)
    result = list_admin_action_logs(session, options)
    return api_ok(
        {
            "items": [audit_log_payload(log) for log in result.items],
            "total": result.total,
            "page": result.page,
            "page_size": result.page_size,
        }
    )
