from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy.orm import Session

from apps.api.app.core.config import get_settings
from apps.api.app.core.deps import get_db_session
from apps.api.app.core.response import api_ok
from apps.api.app.domains.auth.schemas import AdminLoginRequest, LoginRequest, RegisterRequest
from apps.api.app.domains.auth.service import (
    admin_payload,
    authenticate_admin,
    authenticate_user,
    create_admin_session,
    create_user,
    create_user_session,
    delete_admin_session,
    delete_user_session,
    get_user_by_token,
    require_admin,
    list_users,
    user_payload,
)
from apps.api.app.domains.billing.service import create_wallet
from apps.api.app.domains.settings.service import require_public_signup_enabled

public_router = APIRouter(prefix="/auth", tags=["public-auth"])
admin_router = APIRouter(tags=["admin-auth"])


@public_router.post("/register", status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, response: Response, session: Session = Depends(get_db_session)):
    require_public_signup_enabled(session)
    user = create_user(session, email=payload.email, password=payload.password)
    create_wallet(session, user_id=user.id)
    token = create_user_session(session, user)
    session.commit()
    response.set_cookie(get_settings().user_session_cookie_name, token, httponly=True, samesite="lax")
    return api_ok(user_payload(user))


@public_router.post("/login")
def login(payload: LoginRequest, response: Response, session: Session = Depends(get_db_session)):
    user = authenticate_user(session, email=payload.email, password=payload.password)
    token = create_user_session(session, user)
    session.commit()
    response.set_cookie(get_settings().user_session_cookie_name, token, httponly=True, samesite="lax")
    return api_ok(user_payload(user))


@public_router.get("/me")
def me(request: Request, session: Session = Depends(get_db_session)):
    token = request.cookies.get(get_settings().user_session_cookie_name)
    return api_ok(user_payload(get_user_by_token(session, token)))


@public_router.post("/logout")
def logout(request: Request, response: Response, session: Session = Depends(get_db_session)):
    delete_user_session(session, request.cookies.get(get_settings().user_session_cookie_name))
    session.commit()
    response.delete_cookie(get_settings().user_session_cookie_name)
    return api_ok({"logged_out": True})


@admin_router.post("/auth/login")
def admin_login(payload: AdminLoginRequest, response: Response, session: Session = Depends(get_db_session)):
    admin = authenticate_admin(session, username=payload.username, password=payload.password)
    token = create_admin_session(session, admin)
    session.commit()
    set_admin_session_cookie(response, token)
    return api_ok(admin_payload(admin))


@admin_router.get("/auth/me")
def admin_me(request: Request, session: Session = Depends(get_db_session)):
    return api_ok(admin_payload(require_admin(request, session)))


@admin_router.post("/auth/logout")
def admin_logout(request: Request, response: Response, session: Session = Depends(get_db_session)):
    delete_admin_session(session, request.cookies.get(get_settings().admin_session_cookie_name))
    session.commit()
    response.delete_cookie(get_settings().admin_session_cookie_name, path="/")
    return api_ok({"logged_out": True})


@admin_router.get("/users")
@admin_router.get("/auth/users")
def admin_users(request: Request, session: Session = Depends(get_db_session)):
    require_admin(request, session)
    return api_ok([user_payload(user) for user in list_users(session)])


def set_admin_session_cookie(response: Response, token: str) -> None:
    settings = get_settings()
    response.set_cookie(
        settings.admin_session_cookie_name,
        token,
        httponly=True,
        samesite="lax",
        secure=settings.app_env == "production",
        max_age=settings.admin_session_max_age_seconds,
        path="/",
    )
