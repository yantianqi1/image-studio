from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from apps.api.app.core.deps import get_db_session
from apps.api.app.core.response import api_ok
from apps.api.app.domains.auth.service import require_admin
from apps.api.app.domains.settings.schemas import SettingsUpdateRequest
from apps.api.app.domains.settings.service import (
    get_settings_record,
    settings_payload,
    update_settings_record,
)

public_router = APIRouter(prefix="/settings", tags=["settings-public"])
admin_router = APIRouter(prefix="/settings", tags=["settings-admin"])


@public_router.get("")
def get_public_site_settings(session: Session = Depends(get_db_session)):
    return api_ok(settings_payload(get_settings_record(session)))


@admin_router.get("")
def get_site_settings(request: Request, session: Session = Depends(get_db_session)):
    require_admin(request, session)
    return api_ok(settings_payload(get_settings_record(session), include_admin_fields=True))


@admin_router.patch("")
def update_site_settings(
    payload: SettingsUpdateRequest,
    request: Request,
    session: Session = Depends(get_db_session),
):
    require_admin(request, session)
    record = update_settings_record(session, payload)
    session.commit()
    return api_ok(settings_payload(record, include_admin_fields=True))
