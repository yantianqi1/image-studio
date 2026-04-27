from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from apps.api.app.core.config import get_settings
from apps.api.app.core.errors import AppError
from apps.api.app.domains.auth.service import authenticate_admin, create_admin_account, ensure_default_admin
from apps.api.app.domains.billing.models import WalletLedger, WalletReservation
from apps.api.app.infra.db.session import initialize_database
from apps.api.app.infra.db.session import session_scope
from apps.api.app.main import create_app


def build_domain_client() -> TestClient:
    initialize_database()
    return TestClient(create_app())


def seed_admin(*, username: str = "root", password: str = "admin-pass") -> None:
    with session_scope() as session:
        create_admin_account(session=session, username=username, password=password)


def register_user(client: TestClient, email: str = "alice@example.com") -> None:
    response = client.post(
        "/api/public/auth/register",
        json={"email": email, "password": "top-secret"},
    )

    assert response.status_code == 201


def login_admin(client: TestClient, username: str = "root", password: str = "admin-pass") -> None:
    response = client.post(
        "/api/admin/auth/login",
        json={"username": username, "password": password},
    )

    assert response.status_code == 200


def test_register_login_me_and_wallet_signup_bonus():
    client = build_domain_client()

    register_response = client.post(
        "/api/public/auth/register",
        json={"email": "alice@example.com", "password": "top-secret"},
    )

    assert register_response.status_code == 201
    assert register_response.cookies["studio_user_session"]

    me_response = client.get("/api/public/auth/me")
    wallet_response = client.get("/api/public/billing/wallets/me")

    assert me_response.status_code == 200
    assert me_response.json()["data"]["email"] == "alice@example.com"
    assert wallet_response.status_code == 200
    assert wallet_response.json()["data"]["balance_cents"] == 100

    logout_response = client.post("/api/public/auth/logout")
    relogin_response = client.post(
        "/api/public/auth/login",
        json={"email": "alice@example.com", "password": "top-secret"},
    )

    assert logout_response.status_code == 200
    assert relogin_response.status_code == 200
    assert client.get("/api/public/auth/me").status_code == 200


def test_admin_login_me_and_logout():
    client = build_domain_client()
    seed_admin()

    login_response = client.post(
        "/api/admin/auth/login",
        json={"username": "root", "password": "admin-pass"},
    )

    assert login_response.status_code == 200
    assert login_response.cookies["studio_admin_session"]
    assert client.get("/api/admin/auth/me").json()["data"]["username"] == "root"

    logout_response = client.post("/api/admin/auth/logout")
    unauthenticated_response = client.get("/api/admin/auth/me")

    assert logout_response.status_code == 200
    assert unauthenticated_response.status_code == 401


def test_admin_login_cookie_secure_flag_is_configurable(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("ADMIN_SESSION_COOKIE_SECURE", "false")
    get_settings.cache_clear()
    client = build_domain_client()
    seed_admin()

    login_response = client.post(
        "/api/admin/auth/login",
        json={"username": "root", "password": "admin-pass"},
    )

    set_cookie = login_response.headers["set-cookie"].lower()
    assert login_response.status_code == 200
    assert "studio_admin_session=" in set_cookie
    assert "; secure" not in set_cookie


def test_default_admin_bootstrap_updates_existing_password(monkeypatch):
    build_domain_client()
    monkeypatch.setenv("DEFAULT_ADMIN_USERNAME", "admin")
    monkeypatch.setenv("DEFAULT_ADMIN_PASSWORD", "20021214Ytq")
    get_settings.cache_clear()

    with session_scope() as session:
        create_admin_account(session=session, username="admin", password="change-me")
        ensure_default_admin(session)
        with pytest.raises(AppError):
            authenticate_admin(session, username="admin", password="change-me")
        assert authenticate_admin(session, username="admin", password="20021214Ytq").username == "admin"


def test_redeem_code_credits_wallet_and_redeem_twice_fails():
    client = build_domain_client()
    seed_admin()
    register_user(client)
    login_admin(client)

    batch_response = client.post(
        "/api/admin/redeem/batches",
        json={
            "name": "launch",
            "credit_amount_cents": 250,
            "codes": ["PROMO-001"],
        },
    )

    assert batch_response.status_code == 201

    user_client = build_domain_client()
    register_user(user_client, email="bob@example.com")

    redeem_response = user_client.post("/api/public/redeem/redeem", json={"code": "PROMO-001"})
    second_redeem_response = user_client.post("/api/public/redeem/redeem", json={"code": "PROMO-001"})
    wallet_response = user_client.get("/api/public/billing/wallets/me")

    assert redeem_response.status_code == 200
    assert wallet_response.json()["data"]["balance_cents"] == 350
    assert second_redeem_response.status_code == 409


def test_reservation_commit_writes_ledger_and_updates_balance():
    client = build_domain_client()
    register_user(client)

    reserve_response = client.post(
        "/api/public/billing/wallets/me/reservations",
        json={"amount_cents": 30, "reason": "image-job"},
    )

    reservation_id = reserve_response.json()["data"]["reservation_id"]
    commit_response = client.post(f"/api/public/billing/wallets/me/reservations/{reservation_id}/commit")
    wallet_response = client.get("/api/public/billing/wallets/me")

    assert reserve_response.status_code == 201
    assert commit_response.status_code == 200
    assert wallet_response.json()["data"]["balance_cents"] == 70

    with session_scope() as session:
        ledger_rows = session.scalars(
            select(WalletLedger).order_by(WalletLedger.created_at.asc())
        ).all()
        reservation = session.get(WalletReservation, reservation_id)

    assert [row.amount_cents for row in ledger_rows] == [100, -30]
    assert reservation.status == "committed"


def test_reservation_release_keeps_balance_and_does_not_write_ledger():
    client = build_domain_client()
    register_user(client)

    reserve_response = client.post(
        "/api/public/billing/wallets/me/reservations",
        json={"amount_cents": 40, "reason": "draft-job"},
    )

    reservation_id = reserve_response.json()["data"]["reservation_id"]
    release_response = client.post(f"/api/public/billing/wallets/me/reservations/{reservation_id}/release")
    wallet_response = client.get("/api/public/billing/wallets/me")

    assert release_response.status_code == 200
    assert wallet_response.json()["data"]["balance_cents"] == 100

    with session_scope() as session:
        ledger_rows = session.scalars(select(WalletLedger).order_by(WalletLedger.created_at.asc())).all()
        reservation = session.get(WalletReservation, reservation_id)

    assert [row.amount_cents for row in ledger_rows] == [100]
    assert reservation.status == "released"


def test_admin_api_without_session_returns_unauthorized_json():
    client = build_domain_client()

    responses = [
        client.get("/api/admin/auth/users"),
        client.get("/api/admin/auth/me"),
        client.get("/api/admin/users"),
        client.get("/api/admin/image-tasks"),
        client.get("/api/admin/comic-tasks"),
    ]

    assert all(response.status_code == 401 for response in responses)
    assert all(response.json() == {"error": "Unauthorized"} for response in responses)
