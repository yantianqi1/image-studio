from __future__ import annotations

from fastapi.testclient import TestClient

from apps.api.app.domains.auth.service import create_admin_account
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


def test_admin_audit_log_query_includes_wallet_and_status_actions():
    client = build_domain_client()
    seed_admin()
    user_id = register_user(client, email="audit-user@example.com")
    login_admin(client)

    wallet_response = client.post(
        f"/api/admin/billing/wallets/{user_id}/adjustments",
        json={"amount_cents": 50, "reason": "bonus correction"},
    )
    status_response = client.patch(
        f"/api/admin/users/{user_id}/status",
        json={"status": "disabled", "reason": "policy review"},
    )
    audit_response = client.get("/api/admin/audit-logs", params={"target_type": "user", "target_id": str(user_id)})
    items = audit_response.json()["data"]["items"]

    assert wallet_response.status_code == 200
    assert status_response.status_code == 200
    assert audit_response.status_code == 200
    assert [item["action"] for item in items] == ["user.wallet.adjust", "user.status.update"]
    assert items[0]["admin_user_id"] == 1
    assert items[0]["reason"] == "bonus correction"
    assert items[0]["metadata"]["balance_after_cents"] == 150
    assert items[1]["metadata"]["status_from"] == "active"
    assert items[1]["metadata"]["status_to"] == "disabled"


def test_admin_audit_log_query_includes_redeem_batch_creation():
    client = build_domain_client()
    seed_admin()
    login_admin(client)

    batch_response = client.post(
        "/api/admin/redeem/batches",
        json={
            "name": "audit-batch",
            "credit_amount_cents": 100,
            "quantity": 1,
            "reason": "campaign audit",
        },
    )
    batch_id = str(batch_response.json()["data"]["id"])
    audit_response = client.get("/api/admin/audit-logs", params={"target_type": "redeem_batch", "target_id": batch_id})
    items = audit_response.json()["data"]["items"]

    assert batch_response.status_code == 201
    assert audit_response.status_code == 200
    assert [item["action"] for item in items] == ["redeem.batch.create"]
    assert items[0]["metadata"]["quantity"] == 1
    assert items[0]["metadata"]["credit_amount_cents"] == 100
