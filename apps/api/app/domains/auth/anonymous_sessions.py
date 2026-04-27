from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String, select
from sqlalchemy.orm import Mapped, Session, mapped_column

from apps.api.app.core.security import issue_session_token, sha256_hex
from apps.api.app.infra.db.base import Base

TOKEN_HASH_LENGTH = 64


class AnonymousSession(Base):
    __tablename__ = "anonymous_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    token_hash: Mapped[str] = mapped_column(String(TOKEN_HASH_LENGTH), unique=True, index=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    revoked_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    rotated_from_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("anonymous_sessions.id"),
        nullable=True,
        index=True,
    )


@dataclass(frozen=True)
class AnonymousSessionOutcome:
    session: AnonymousSession
    token: str | None
    created: bool


def ensure_anonymous_session(session: Session, token: str | None) -> AnonymousSessionOutcome:
    existing = get_anonymous_session_by_token(session, token)
    if existing is not None:
        return AnonymousSessionOutcome(session=existing, token=None, created=False)
    anonymous_session, issued_token = create_anonymous_session(session)
    return AnonymousSessionOutcome(session=anonymous_session, token=issued_token, created=True)


def create_anonymous_session(session: Session) -> tuple[AnonymousSession, str]:
    token = issue_session_token()
    anonymous_session = AnonymousSession(token_hash=sha256_hex(token))
    session.add(anonymous_session)
    session.flush()
    return anonymous_session, token


def get_anonymous_session_by_token(session: Session, token: str | None) -> AnonymousSession | None:
    if not token:
        return None
    token_hash = sha256_hex(token)
    statement = select(AnonymousSession).where(
        AnonymousSession.token_hash == token_hash,
        AnonymousSession.revoked_at.is_(None),
    )
    return session.execute(statement).scalar_one_or_none()
