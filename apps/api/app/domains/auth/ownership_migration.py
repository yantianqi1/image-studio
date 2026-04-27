from __future__ import annotations

from datetime import datetime

from sqlalchemy import update
from sqlalchemy.orm import Session

from apps.api.app.core.errors import AppError
from apps.api.app.domains.auth.anonymous_sessions import AnonymousSession
from apps.api.app.domains.comic.models import ComicProject, ComicTask
from apps.api.app.domains.image.models import Asset, ImageJob


def migrate_anonymous_owner_to_user(session: Session, anonymous_session_id: int, user_id: int) -> None:
    anonymous_session = require_active_anonymous_session(session, anonymous_session_id)
    update_owner_rows(session, anonymous_session_id=anonymous_session_id, user_id=user_id)
    anonymous_session.revoked_at = datetime.utcnow()
    session.flush()


def require_active_anonymous_session(session: Session, anonymous_session_id: int) -> AnonymousSession:
    anonymous_session = session.get(AnonymousSession, anonymous_session_id)
    if anonymous_session is None:
        raise AppError(code="anonymous_session_not_found", message="anonymous session not found", status_code=404)
    if anonymous_session.revoked_at is not None:
        raise AppError(code="anonymous_session_revoked", message="anonymous session revoked", status_code=409)
    return anonymous_session


def update_owner_rows(session: Session, *, anonymous_session_id: int, user_id: int) -> None:
    session.execute(
        update(ComicProject)
        .where(ComicProject.owner_anonymous_session_id == anonymous_session_id)
        .values(owner_user_id=user_id, owner_anonymous_session_id=None)
    )
    session.execute(
        update(ComicTask)
        .where(ComicTask.anonymous_session_id == anonymous_session_id)
        .values(user_id=user_id, anonymous_session_id=None)
    )
    session.execute(
        update(ImageJob)
        .where(ImageJob.anonymous_session_id == anonymous_session_id)
        .values(user_id=user_id, anonymous_session_id=None)
    )
    session.execute(
        update(Asset)
        .where(Asset.owner_anonymous_session_id == anonymous_session_id)
        .values(owner_user_id=user_id, owner_anonymous_session_id=None)
    )
