from __future__ import annotations

from sqlalchemy import inspect

from apps.api.app.domains.image.models import ImageJob
from apps.api.app.infra.db.session import get_engine, session_scope
from apps.api.tests.test_image_jobs import build_client, register_user


def test_member_image_job_has_no_local_billing_fields() -> None:
    client = build_client()
    register_user(client, email="newapi-removal@example.com")

    response = client.post(
        "/api/public/image/jobs",
        json={"prompt": "NewAPI billing removal", "model_code": "gpt-image-2", "requested_count": 1},
    )

    assert response.status_code == 201
    job = response.json()["data"]
    assert "charge_cents" not in job
    assert "charge_credits" not in job

    with session_scope() as session:
        stored_job = session.get(ImageJob, job["id"])

    assert stored_job is not None
    assert not hasattr(stored_job, "reservation_id")
    assert not hasattr(stored_job, "charge_cents")


def test_register_does_not_create_local_wallet_table_rows() -> None:
    client = build_client()
    register_user(client, email="newapi-no-wallet@example.com")

    inspector = inspect(get_engine())
    assert not inspector.has_table("wallets")
    assert not inspector.has_table("wallet_ledger")
    assert not inspector.has_table("wallet_reservations")


def test_billing_and_redeem_routes_are_unmounted() -> None:
    client = build_client()
    register_user(client, email="newapi-routes@example.com")

    assert client.get("/api/public/billing/wallets/me").status_code == 404
    assert client.post("/api/public/redeem/redeem", json={"code": "OLD-CODE"}).status_code == 404
    assert client.get("/api/admin/billing/wallets/1").status_code == 404
    assert client.get("/api/admin/redeem/batches").status_code == 404


def test_local_billing_tables_and_price_columns_are_removed() -> None:
    build_client()
    inspector = inspect(get_engine())
    assert not inspector.has_table("activation_code_batches")
    assert not inspector.has_table("activation_codes")
    assert not inspector.has_table("model_variants")

    image_columns = {column["name"] for column in inspector.get_columns("image_jobs")}
    model_columns = {column["name"] for column in inspector.get_columns("sellable_models")}
    assert "charge_cents" not in image_columns
    assert "reservation_id" not in image_columns
    assert "member_price_cents" not in model_columns
    assert "anonymous_price_cents" not in model_columns
