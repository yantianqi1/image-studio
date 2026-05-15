from __future__ import annotations

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.core.errors import AppError
from apps.api.app.domains.settings.models import DEFAULT_CLIENT_PROVIDER_URL_POOL, SiteSettings
from apps.api.app.domains.settings.schemas import SettingsUpdateRequest


def get_settings_record(session: Session) -> SiteSettings:
    record = session.execute(select(SiteSettings).limit(1)).scalar_one_or_none()
    if record is None:
        record = SiteSettings(client_provider_url_pool=DEFAULT_CLIENT_PROVIDER_URL_POOL)
        session.add(record)
        session.flush()
    return record


def update_settings_record(session: Session, payload: SettingsUpdateRequest) -> SiteSettings:
    record = get_settings_record(session)
    record.site_title = payload.site_title
    record.allow_public_signup = payload.allow_public_signup
    record.allow_anonymous_image = payload.allow_anonymous_image
    record.uploads_enabled = payload.uploads_enabled
    if payload.client_provider_url_pool is not None:
        record.client_provider_url_pool = payload.client_provider_url_pool.strip()
    update_public_quota_settings(record, payload)
    record.updated_at = datetime.utcnow()
    session.flush()
    return record


def update_public_quota_settings(record: SiteSettings, payload: SettingsUpdateRequest) -> None:
    if payload.public_quota_mode is not None:
        record.public_quota_mode = payload.public_quota_mode
    if payload.public_quota_daily_global_limit is not None:
        record.public_quota_daily_global_limit = payload.public_quota_daily_global_limit
    if payload.public_quota_per_ip_limit is not None:
        record.public_quota_per_ip_limit = payload.public_quota_per_ip_limit


def require_public_signup_enabled(session: Session) -> None:
    record = get_settings_record(session)
    if not record.allow_public_signup:
        raise AppError(code="public_signup_disabled", message="public signup disabled", status_code=403)


def require_anonymous_image_enabled(session: Session) -> None:
    record = get_settings_record(session)
    if not record.allow_anonymous_image:
        raise AppError(code="anonymous_image_disabled", message="anonymous image disabled", status_code=403)


def require_uploads_enabled(session: Session) -> None:
    record = get_settings_record(session)
    if not record.uploads_enabled:
        raise AppError(code="uploads_disabled", message="uploads disabled", status_code=403)


def get_client_provider_url_pool(session: Session) -> tuple[str, ...]:
    record = get_settings_record(session)
    return tuple(
        line.strip()
        for line in record.client_provider_url_pool.splitlines()
        if line.strip()
    )


def settings_payload(record: SiteSettings, *, include_admin_fields: bool = False) -> dict[str, object]:
    payload: dict[str, object] = {
        "site_title": record.site_title,
        "allow_public_signup": record.allow_public_signup,
        "allow_anonymous_image": record.allow_anonymous_image,
        "uploads_enabled": record.uploads_enabled,
        "public_quota_mode": record.public_quota_mode,
        "public_quota_daily_global_limit": record.public_quota_daily_global_limit,
        "public_quota_per_ip_limit": record.public_quota_per_ip_limit,
        "updated_at": record.updated_at.isoformat(),
    }
    if include_admin_fields:
        payload["client_provider_url_pool"] = record.client_provider_url_pool
    return payload
