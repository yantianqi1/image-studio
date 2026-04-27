from __future__ import annotations

from sqlalchemy import text

from apps.api.app.core.config import get_settings
from apps.api.app.infra.db.session import session_scope

COOKIE_NAME = "studio_anonymous_session"
TOKEN_HASH_LENGTH = 64


def test_anonymous_session_endpoint_issues_cookie_and_stores_hash(client):
    response = client.post("/api/public/auth/anonymous-session")

    assert response.status_code == 201
    token = response.cookies[COOKIE_NAME]
    assert response.json()["data"]["anonymous_session_id"] == 1

    with session_scope() as session:
        row = session.execute(
            text("select id, token_hash, revoked_at from anonymous_sessions")
        ).mappings().one()

    assert row["id"] == 1
    assert row["token_hash"] != token
    assert len(row["token_hash"]) == TOKEN_HASH_LENGTH
    assert row["revoked_at"] is None


def test_anonymous_session_endpoint_reuses_existing_cookie(client):
    first_response = client.post("/api/public/auth/anonymous-session")
    second_response = client.post("/api/public/auth/anonymous-session")

    assert second_response.status_code == 200
    assert second_response.cookies.get(COOKIE_NAME) is None
    assert second_response.json()["data"] == first_response.json()["data"]

    with session_scope() as session:
        count = session.execute(text("select count(*) from anonymous_sessions")).scalar_one()

    assert count == 1


def test_anonymous_session_cookie_secure_flag_is_configurable(client, monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("ANONYMOUS_SESSION_COOKIE_SECURE", "false")
    get_settings.cache_clear()

    response = client.post("/api/public/auth/anonymous-session")

    set_cookie = response.headers["set-cookie"].lower()
    assert response.status_code == 201
    assert f"{COOKIE_NAME}=" in set_cookie
    assert "; secure" not in set_cookie
