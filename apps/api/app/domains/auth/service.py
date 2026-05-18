from __future__ import annotations

from dataclasses import dataclass

from fastapi import Request
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session
from sqlalchemy.sql.elements import ColumnElement

from apps.api.app.core.config import get_settings
from apps.api.app.core.errors import AppError
from apps.api.app.core.security import hash_password, issue_session_token, sha256_hex, verify_password
from apps.api.app.domains.auth.models import AdminSession, AdminUser, User, UserSession
from apps.api.app.domains.auth.schemas import AdminUserListOptions

ACTIVE_USER_STATUS = "active"
SELF_PROTECTED_STATUS_UPDATES = frozenset({"disabled", "deleted"})


@dataclass(frozen=True)
class AdminUserListResult:
    items: list[User]
    total: int
    page: int
    page_size: int


@dataclass(frozen=True)
class UserStatusUpdateResult:
    user: User
    previous_status: str


def create_user(session: Session, *, email: str, password: str) -> User:
    if find_user_by_email(session, email) is not None:
        raise AppError(code="user_exists", message="user already exists", status_code=409)
    user = User(email=email, password_hash=hash_password(password), display_name=email.split("@")[0])
    session.add(user)
    session.flush()
    return user


def create_user_session(session: Session, user: User) -> str:
    token = issue_session_token()
    session.add(UserSession(user_id=user.id, token_hash=sha256_hex(token)))
    session.flush()
    return token


def authenticate_user(session: Session, *, email: str, password: str) -> User:
    user = find_user_by_email(session, email)
    if user is None or not verify_password(password, user.password_hash):
        raise AppError(code="invalid_credentials", message="invalid credentials", status_code=401)
    require_active_user(user)
    return user


def get_user_by_token(session: Session, token: str | None) -> User:
    user = find_user_by_token(session, token)
    if user is None:
        raise AppError(code="unauthorized", message="authentication required", status_code=401)
    require_active_user(user)
    return user


def find_user_by_token(session: Session, token: str | None) -> User | None:
    token_hash = sha256_hex(token or "")
    statement = select(User).join(UserSession, User.id == UserSession.user_id).where(UserSession.token_hash == token_hash)
    return session.execute(statement).scalar_one_or_none()


def delete_user_session(session: Session, token: str | None) -> None:
    token_hash = sha256_hex(token or "")
    session.query(UserSession).filter(UserSession.token_hash == token_hash).delete()
    session.flush()


def create_admin_account(session: Session, *, username: str, password: str) -> AdminUser:
    existing = session.execute(select(AdminUser).where(AdminUser.username == username)).scalar_one_or_none()
    if existing is not None:
        if not verify_password(password, existing.password_hash):
            existing.password_hash = hash_password(password)
            session.flush()
        return existing
    admin = AdminUser(username=username, password_hash=hash_password(password))
    session.add(admin)
    session.flush()
    return admin


def ensure_default_admin(session: Session) -> AdminUser | None:
    settings = get_settings()
    if not settings.default_admin_username or not settings.default_admin_password:
        return None
    return create_admin_account(
        session,
        username=settings.default_admin_username,
        password=settings.default_admin_password,
    )


def authenticate_admin(session: Session, *, username: str, password: str) -> AdminUser:
    admin = session.execute(select(AdminUser).where(AdminUser.username == username)).scalar_one_or_none()
    if admin is None or not verify_password(password, admin.password_hash):
        raise AppError(code="invalid_credentials", message="invalid credentials", status_code=401)
    return admin


def create_admin_session(session: Session, admin: AdminUser) -> str:
    token = issue_session_token()
    session.add(AdminSession(admin_user_id=admin.id, token_hash=sha256_hex(token)))
    session.flush()
    return token


def get_admin_by_token(session: Session, token: str | None) -> AdminUser:
    token_hash = sha256_hex(token or "")
    statement = select(AdminUser).join(AdminSession, AdminUser.id == AdminSession.admin_user_id)
    admin = session.execute(statement.where(AdminSession.token_hash == token_hash)).scalar_one_or_none()
    if admin is None:
        raise AppError(code="unauthorized", message="admin authentication required", status_code=401)
    return admin


def require_admin(request: Request, session: Session) -> AdminUser:
    token = request.cookies.get(get_settings().admin_session_cookie_name)
    return get_admin_by_token(session, token)


def delete_admin_session(session: Session, token: str | None) -> None:
    token_hash = sha256_hex(token or "")
    session.query(AdminSession).filter(AdminSession.token_hash == token_hash).delete()
    session.flush()


def find_user_by_email(session: Session, email: str) -> User | None:
    return session.execute(select(User).where(User.email == email)).scalar_one_or_none()


def list_users(session: Session, options: AdminUserListOptions) -> AdminUserListResult:
    filters = build_user_filters(options)
    total = count_users(session, filters)
    offset = (options.page - 1) * options.page_size
    statement = select(User).where(*filters).order_by(User.id.asc()).offset(offset).limit(options.page_size)
    users = list(session.execute(statement).scalars())
    return AdminUserListResult(items=users, total=total, page=options.page, page_size=options.page_size)


def update_user_status(
    session: Session,
    *,
    user_id: int,
    status: str,
    reason: str,
    actor_admin_username: str | None = None,
) -> UserStatusUpdateResult:
    user = session.get(User, user_id)
    if user is None:
        raise AppError(code="user_not_found", message="user not found", status_code=404)
    if not reason.strip():
        raise AppError(code="reason_required", message="reason is required", status_code=422)
    previous_status = user.status
    if is_self_status_update(user, actor_admin_username, status):
        raise AppError(
            code="self_status_update_forbidden",
            message="cannot disable or delete current user",
            status_code=403,
        )
    user.status = status
    session.flush()
    return UserStatusUpdateResult(user=user, previous_status=previous_status)


def require_active_user(user: User) -> None:
    if user.status == ACTIVE_USER_STATUS:
        return
    raise AppError(code="user_not_active", message="user is not active", status_code=403)


def is_self_status_update(user: User, actor_admin_username: str | None, status: str) -> bool:
    if actor_admin_username is None or status not in SELF_PROTECTED_STATUS_UPDATES:
        return False
    return user.email.casefold() == actor_admin_username.casefold()


def build_user_filters(options: AdminUserListOptions) -> tuple[ColumnElement[bool], ...]:
    filters: list[ColumnElement[bool]] = []
    if options.q is not None:
        pattern = f"%{options.q}%"
        filters.append(or_(User.email.ilike(pattern), User.display_name.ilike(pattern)))
    if options.status is not None:
        filters.append(User.status == options.status)
    return tuple(filters)


def count_users(session: Session, filters: tuple[ColumnElement[bool], ...]) -> int:
    statement = select(func.count()).select_from(User).where(*filters)
    return int(session.execute(statement).scalar_one())


def user_payload(user: User) -> dict[str, object]:
    return {
        "id": user.id,
        "email": user.email,
        "display_name": user.display_name,
        "status": user.status,
        "created_at": user.created_at.isoformat(),
    }


def admin_payload(admin: AdminUser) -> dict[str, object]:
    return {"id": admin.id, "username": admin.username, "role": admin.role, "status": admin.status}
