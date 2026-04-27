from __future__ import annotations

from dataclasses import dataclass

from fastapi import Request, Response
from sqlalchemy.orm import Session

from apps.api.app.core.config import get_settings
from apps.api.app.domains.auth.anonymous_sessions import (
    ensure_anonymous_session,
    get_anonymous_session_by_token,
)
from apps.api.app.domains.auth.service import find_user_by_token


@dataclass(frozen=True)
class OwnerContext:
    user_id: int | None
    anonymous_session_id: int | None


def resolve_request_owner(request: Request, session: Session) -> OwnerContext:
    user_id = resolve_user_id(request, session)
    if user_id is not None:
        return OwnerContext(user_id=user_id, anonymous_session_id=None)
    anonymous_session = get_anonymous_session_by_token(
        session,
        request.cookies.get(get_settings().anonymous_session_cookie_name),
    )
    if anonymous_session is None:
        return OwnerContext(user_id=None, anonymous_session_id=None)
    return OwnerContext(user_id=None, anonymous_session_id=anonymous_session.id)


def ensure_anonymous_owner(request: Request, response: Response, session: Session) -> OwnerContext:
    owner = resolve_request_owner(request, session)
    if owner.user_id is not None or owner.anonymous_session_id is not None:
        return owner
    outcome = ensure_anonymous_session(session, None)
    if outcome.token is not None:
        set_anonymous_session_cookie(response, outcome.token)
    return OwnerContext(user_id=None, anonymous_session_id=outcome.session.id)


def resolve_user_id(request: Request, session: Session) -> int | None:
    token = request.cookies.get(get_settings().user_session_cookie_name)
    user = find_user_by_token(session, token) if token else None
    return user.id if user is not None else None


def set_anonymous_session_cookie(response: Response, token: str) -> None:
    settings = get_settings()
    response.set_cookie(
        settings.anonymous_session_cookie_name,
        token,
        httponly=True,
        samesite="lax",
        secure=settings.app_env == "production",
        max_age=settings.anonymous_session_max_age_seconds,
        path="/",
    )


def delete_anonymous_session_cookie(response: Response) -> None:
    response.delete_cookie(get_settings().anonymous_session_cookie_name, path="/")
