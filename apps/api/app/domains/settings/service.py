from __future__ import annotations

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.core.errors import AppError
from apps.api.app.domains.settings.models import SiteSettings
from apps.api.app.domains.settings.schemas import SettingsUpdateRequest


def get_settings_record(session: Session) -> SiteSettings:
    record = session.execute(select(SiteSettings).limit(1)).scalar_one_or_none()
    if record is None:
        record = SiteSettings()
        session.add(record)
        session.flush()
    return record


def update_settings_record(session: Session, payload: SettingsUpdateRequest) -> SiteSettings:
    record = get_settings_record(session)
    record.site_title = payload.site_title
    record.allow_public_signup = payload.allow_public_signup
    record.allow_anonymous_image = payload.allow_anonymous_image
    record.uploads_enabled = payload.uploads_enabled
    record.updated_at = datetime.utcnow()
    session.flush()
    return record


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


def settings_payload(record: SiteSettings) -> dict[str, object]:
    return {
        "site_title": record.site_title,
        "allow_public_signup": record.allow_public_signup,
        "allow_anonymous_image": record.allow_anonymous_image,
        "uploads_enabled": record.uploads_enabled,
        "updated_at": record.updated_at.isoformat(),
    }
