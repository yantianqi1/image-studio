from __future__ import annotations

import re

import pytest
from fastapi.testclient import TestClient

from apps.api.app.domains.auth.service import create_admin_account
from apps.api.app.domains.redeem.models import ActivationCode, ActivationCodeBatch
from apps.api.app.infra.db.session import initialize_database, session_scope
from apps.api.app.main import create_app


def build_domain_client() -> TestClient:
    initialize_database()
    return TestClient(create_app())


def seed_admin(*, username: str = "root", password: str = "admin-pass") -> None:
    with session_scope() as session:
        create_admin_account(session=session, username=username, password=password)


def register_user(client: TestClient, email: str = "alice@example.com") -> int:
    response = client.post(
        "/api/public/auth/register",
        json={"email": email, "password": "top-secret"},
    )
    assert response.status_code == 201
    return response.json()["data"]["id"]


def login_admin(client: TestClient, username: str = "root", password: str = "admin-pass") -> None:
    response = client.post(
        "/api/admin/auth/login",
        json={"username": username, "password": password},
    )
    assert response.status_code == 200


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
            "quantity": 1,
            "prefix": "PROMO",
            "reason": "launch campaign",
        },
    )

    assert batch_response.status_code == 201

    user_client = build_domain_client()
    register_user(user_client, email="bob@example.com")
    code = batch_response.json()["data"]["codes"][0]

    redeem_response = user_client.post("/api/public/redeem/redeem", json={"code": code})
    second_redeem_response = user_client.post("/api/public/redeem/redeem", json={"code": code})
    wallet_response = user_client.get("/api/public/billing/wallets/me")

    assert redeem_response.status_code == 200
    assert wallet_response.json()["data"]["balance_cents"] == 350
    assert wallet_response.json()["data"]["balance_credits"] == 35
    assert second_redeem_response.status_code == 409


def test_admin_redeem_batch_generates_codes_and_lists_batch_summary():
    client = build_domain_client()
    seed_admin()
    login_admin(client)

    response = client.post(
        "/api/admin/redeem/batches",
        json={
            "name": "compensation",
            "credit_amount_cents": 1000,
            "quantity": 3,
            "prefix": "COMP",
            "expires_at": "2026-06-30T23:59:59Z",
            "note": "internal note",
            "reason": "customer compensation",
        },
    )
    payload = response.json()["data"]
    batches_response = client.get("/api/admin/redeem/batches")

    assert response.status_code == 201
    assert payload["name"] == "compensation"
    assert payload["quantity"] == 3
    assert len(payload["codes"]) == 3
    assert len(set(payload["codes"])) == 3
    assert all(re.fullmatch(r"COMP-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}", code) for code in payload["codes"])

    batch = batches_response.json()["data"][0]
    assert batch["name"] == "compensation"
    assert batch["credit_amount_cents"] == 1000
    assert batch["quantity"] == 3
    assert batch["redeemed_quantity"] == 0
    assert batch["unused_quantity"] == 3
    assert batch["expires_at"] == "2026-06-30T23:59:59"
    assert batch["status"] == "active"


def test_redeem_batch_requires_quantity_instead_of_manual_codes():
    client = build_domain_client()
    seed_admin()
    login_admin(client)

    response = client.post(
        "/api/admin/redeem/batches",
        json={
            "name": "legacy-shape",
            "credit_amount_cents": 100,
            "codes": ["LEGACY-001"],
            "reason": "invalid legacy shape",
        },
    )

    assert response.status_code == 422


def test_existing_legacy_activation_codes_still_list_and_redeem():
    client = build_domain_client()
    seed_admin()
    register_user(client)
    login_admin(client)

    with session_scope() as session:
        batch = ActivationCodeBatch(name="legacy", credit_amount_cents=300)
        session.add(batch)
        session.flush()
        session.add(ActivationCode(batch_id=batch.id, code="LEGACY-001", credit_amount_cents=300))

    codes_response = client.get("/api/admin/redeem/codes")
    batches_response = client.get("/api/admin/redeem/batches")
    redeem_response = client.post("/api/public/redeem/redeem", json={"code": "LEGACY-001"})
    wallet_response = client.get("/api/public/billing/wallets/me")

    assert codes_response.status_code == 200
    assert codes_response.json()["data"][0]["code"] == "LEGACY-001"
    assert batches_response.json()["data"][0]["quantity"] == 1
    assert redeem_response.status_code == 200
    assert wallet_response.json()["data"]["balance_cents"] == 400


def test_admin_redeem_batch_detail_lists_codes_and_counts():
    client = build_domain_client()
    seed_admin()
    login_admin(client)
    create_response = client.post(
        "/api/admin/redeem/batches",
        json={
            "name": "detail",
            "credit_amount_cents": 200,
            "quantity": 2,
            "expires_at": "2026-06-30T23:59:59Z",
            "reason": "detail audit",
        },
    )
    batch_id = create_response.json()["data"]["id"]

    detail_response = client.get(f"/api/admin/redeem/batches/{batch_id}")
    codes_response = client.get(f"/api/admin/redeem/batches/{batch_id}/codes")
    detail = detail_response.json()["data"]
    codes = codes_response.json()["data"]

    assert detail_response.status_code == 200
    assert detail["id"] == batch_id
    assert detail["quantity"] == 2
    assert detail["unused_quantity"] == 2
    assert detail["redeemed_quantity"] == 0
    assert detail["disabled_quantity"] == 0
    assert detail["expired_quantity"] == 0
    assert codes_response.status_code == 200
    assert len(codes) == 2
    assert {"code", "status", "redeemed_by_user_id", "redeemed_at", "created_at", "expires_at"} <= codes[0].keys()


def test_admin_can_disable_single_code_and_user_cannot_redeem_it():
    client = build_domain_client()
    seed_admin()
    login_admin(client)
    create_response = client.post(
        "/api/admin/redeem/batches",
        json={"name": "disable-code", "credit_amount_cents": 100, "quantity": 1, "reason": "risk review"},
    )
    batch_id = create_response.json()["data"]["id"]
    code_text = create_response.json()["data"]["codes"][0]
    code_row = client.get(f"/api/admin/redeem/batches/{batch_id}/codes").json()["data"][0]

    disable_response = client.post(
        f"/api/admin/redeem/codes/{code_row['id']}/disable",
        json={"reason": "reported leak"},
    )
    user_client = build_domain_client()
    register_user(user_client, email="disabled-code-user@example.com")
    redeem_response = user_client.post("/api/public/redeem/redeem", json={"code": code_text})

    assert disable_response.status_code == 200
    assert disable_response.json()["data"]["status"] == "disabled"
    assert redeem_response.status_code == 409
    assert redeem_response.json()["error"]["code"] == "activation_code_disabled"


def test_admin_can_disable_batch_and_unused_codes():
    client = build_domain_client()
    seed_admin()
    login_admin(client)
    create_response = client.post(
        "/api/admin/redeem/batches",
        json={"name": "disable-batch", "credit_amount_cents": 100, "quantity": 2, "reason": "campaign hold"},
    )
    batch_id = create_response.json()["data"]["id"]
    first_code = create_response.json()["data"]["codes"][0]

    disable_response = client.post(
        f"/api/admin/redeem/batches/{batch_id}/disable",
        json={"reason": "campaign cancelled"},
    )
    codes_response = client.get(f"/api/admin/redeem/batches/{batch_id}/codes")
    user_client = build_domain_client()
    register_user(user_client, email="disabled-batch-user@example.com")
    redeem_response = user_client.post("/api/public/redeem/redeem", json={"code": first_code})

    assert disable_response.status_code == 200
    assert disable_response.json()["data"]["status"] == "disabled"
    assert disable_response.json()["data"]["disabled_quantity"] == 2
    assert {code["status"] for code in codes_response.json()["data"]} == {"disabled"}
    assert redeem_response.status_code == 409
    assert redeem_response.json()["error"]["code"] == "activation_code_batch_inactive"


def test_expired_redeem_batch_codes_cannot_be_redeemed():
    client = build_domain_client()
    seed_admin()
    login_admin(client)
    create_response = client.post(
        "/api/admin/redeem/batches",
        json={
            "name": "expired",
            "credit_amount_cents": 100,
            "quantity": 1,
            "expires_at": "2020-01-01T00:00:00Z",
            "reason": "expired fixture",
        },
    )
    code_text = create_response.json()["data"]["codes"][0]
    user_client = build_domain_client()
    register_user(user_client, email="expired-user@example.com")

    redeem_response = user_client.post("/api/public/redeem/redeem", json={"code": code_text})

    assert redeem_response.status_code == 409
    assert redeem_response.json()["error"]["code"] == "activation_code_expired"


def test_admin_wallet_adjustment_updates_balance_and_ledger():
    client = build_domain_client()
    seed_admin()
    user_id = register_user(client, email="wallet-admin-target@example.com")
    login_admin(client)

    response = client.post(
        f"/api/admin/billing/wallets/{user_id}/adjustments",
        json={"amount_cents": -40, "reason": "manual debit"},
    )
    wallet_response = client.get(f"/api/admin/billing/wallets/{user_id}")
    ledger_response = client.get(f"/api/admin/billing/wallets/{user_id}/ledger")
    ledger_rows = ledger_response.json()["data"]

    assert response.status_code == 200
    assert wallet_response.json()["data"]["balance_cents"] == 60
    assert ledger_rows[-1]["amount_cents"] == -40
    assert ledger_rows[-1]["reason"] == "manual debit"
    assert ledger_rows[-1]["reference_type"] == "admin_adjustment"


@pytest.mark.parametrize(
    "payload",
    [
        {"amount_cents": 0, "reason": "manual adjustment"},
        {"amount_cents": 10, "reason": "   "},
    ],
)
def test_admin_wallet_adjustment_rejects_invalid_input(payload: dict[str, object]):
    client = build_domain_client()
    seed_admin()
    user_id = register_user(client, email="wallet-invalid-target@example.com")
    login_admin(client)

    response = client.post(f"/api/admin/billing/wallets/{user_id}/adjustments", json=payload)

    assert response.status_code == 422
