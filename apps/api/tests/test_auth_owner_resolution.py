from __future__ import annotations

from datetime import datetime

from fastapi import Depends, Request, Response
from fastapi.testclient import TestClient
from sqlalchemy import update
from sqlalchemy.orm import Session

from apps.api.app.core.deps import get_db_session
from apps.api.app.core.response import api_ok
from apps.api.app.domains.auth.anonymous_sessions import AnonymousSession
from apps.api.app.domains.auth.ownership import ensure_anonymous_owner, resolve_request_owner
from apps.api.app.infra.db.session import initialize_database, session_scope
from apps.api.app.main import create_app

COOKIE_NAME = "studio_anonymous_session"
CLIENT_PROVIDER_HEADERS = {
    "x-client-id": "browser-a",
    "x-client-provider-base-url": "https://provider.example/v1",
    "x-client-provider-api-key": "client-secret",
}


def build_owner_client() -> TestClient:
    initialize_database()
    app = create_app()

    @app.get("/owner-probe")
    def owner_probe(request: Request, session: Session = Depends(get_db_session)):
        return api_ok(resolve_request_owner(request, session).__dict__)

    @app.post("/owner-ensure")
    def owner_ensure(request: Request, response: Response, session: Session = Depends(get_db_session)):
        owner = ensure_anonymous_owner(request, response, session)
        session.commit()
        return api_ok(owner.__dict__)

    return TestClient(app)


def test_login_owner_takes_priority_over_anonymous_cookie():
    client = build_owner_client()

    anonymous_response = client.post("/api/public/auth/anonymous-session")
    register_response = client.post(
        "/api/public/auth/register",
        json={"email": "alice@example.com", "password": "top-secret"},
    )
    owner_response = client.get("/owner-probe")

    assert anonymous_response.status_code == 201
    assert register_response.status_code == 201
    assert owner_response.json()["data"] == {"user_id": 1, "anonymous_session_id": None}


def test_anonymous_cookie_resolves_owner():
    client = build_owner_client()

    anonymous_response = client.post("/api/public/auth/anonymous-session")
    owner_response = client.get("/owner-probe")

    assert anonymous_response.status_code == 201
    assert owner_response.json()["data"] == {"user_id": None, "anonymous_session_id": 1}


def test_revoked_anonymous_cookie_gets_new_owner_when_ensured():
    client = build_owner_client()
    anonymous_response = client.post("/api/public/auth/anonymous-session")
    old_session_id = anonymous_response.json()["data"]["anonymous_session_id"]

    revoke_anonymous_session(old_session_id)
    ensure_response = client.post("/owner-ensure")

    assert ensure_response.status_code == 200
    assert ensure_response.json()["data"] == {"user_id": None, "anonymous_session_id": old_session_id + 1}
    assert ensure_response.cookies[COOKIE_NAME]


def test_client_provider_headers_do_not_resolve_identity_owner():
    client = build_owner_client()

    owner_response = client.get("/owner-probe", headers=CLIENT_PROVIDER_HEADERS)

    assert owner_response.status_code == 200
    assert owner_response.json()["data"] == {"user_id": None, "anonymous_session_id": None}


def revoke_anonymous_session(session_id: int) -> None:
    with session_scope() as session:
        session.execute(
            update(AnonymousSession)
            .where(AnonymousSession.id == session_id)
            .values(revoked_at=datetime.utcnow())
        )
