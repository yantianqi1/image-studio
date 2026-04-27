from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from apps.api.app.core.deps import get_db_session
from apps.api.app.core.response import api_ok
from apps.api.app.domains.public_quota.service import get_public_quota_status, resolve_request_ip

public_router = APIRouter(prefix="/quota", tags=["public-quota"])


@public_router.get("")
def get_current_public_quota(request: Request, session: Session = Depends(get_db_session)):
    return api_ok(get_public_quota_status(session, request_ip=resolve_request_ip(request)))
