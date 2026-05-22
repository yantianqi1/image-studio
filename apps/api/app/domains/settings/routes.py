from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from apps.api.app.core.deps import get_db_session
from apps.api.app.core.response import api_ok
from apps.api.app.domains.auth.service import require_admin
from apps.api.app.domains.audit.service import record_admin_ops_action
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
    admin = require_admin(request, session)
    record = update_settings_record(session, payload)
    record_admin_ops_action(
        session,
        admin_user_id=admin.id,
        action="settings.update",
        target_type="site_settings",
        target_id=record.id,
        metadata=settings_audit_metadata(record),
    )
    session.commit()
    return api_ok(settings_payload(record, include_admin_fields=True))


def settings_audit_metadata(record) -> dict[str, object]:
    return {
        "site_title": record.site_title,
        "allow_public_signup": record.allow_public_signup,
        "allow_anonymous_image": record.allow_anonymous_image,
        "uploads_enabled": record.uploads_enabled,
        "public_quota_mode": record.public_quota_mode,
        "public_quota_daily_global_limit": record.public_quota_daily_global_limit,
        "public_quota_per_ip_limit": record.public_quota_per_ip_limit,
        "client_provider_url_pool_lines": count_config_lines(record.client_provider_url_pool),
    }


def count_config_lines(value: str) -> int:
    return len([line for line in value.splitlines() if line.strip()])
