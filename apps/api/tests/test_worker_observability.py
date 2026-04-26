from __future__ import annotations

from datetime import datetime, timedelta

from fastapi.testclient import TestClient

from apps.api.app.domains.auth.service import create_admin_account
from apps.api.app.domains.image.service import get_job
from apps.api.app.infra.db.session import initialize_database, session_scope
from apps.api.app.main import create_app


def build_client() -> TestClient:
    initialize_database()
    return TestClient(create_app())


def seed_admin() -> None:
    with session_scope() as session:
        create_admin_account(session=session, username="root", password="admin-pass")


def admin_login(client: TestClient) -> None:
    response = client.post("/api/admin/auth/login", json={"username": "root", "password": "admin-pass"})
    assert response.status_code == 200


def register_user(client: TestClient, *, email: str = "ops@example.com") -> None:
    response = client.post("/api/public/auth/register", json={"email": email, "password": "top-secret"})
    assert response.status_code == 201


def create_job(client: TestClient) -> int:
    response = client.post(
        "/api/public/image/jobs",
        json={"prompt": "ops prompt", "model_code": "gpt-image-2", "requested_count": 1},
    )
    assert response.status_code == 201
    return response.json()["data"]["id"]


def test_admin_ops_summary_reports_queue_and_stale_jobs():
    client = build_client()
    register_user(client)
    job_id = create_job(client)
    with session_scope() as session:
        job = get_job(session, job_id)
        job.status = "running"
        job.started_at = datetime.utcnow() - timedelta(seconds=3600)
        session.flush()
    seed_admin()
    admin_login(client)

    response = client.get("/api/admin/ops/worker-summary")

    assert response.status_code == 200
    payload = response.json()["data"]
    assert payload["image_jobs"]["running"] >= 1
    assert payload["image_jobs"]["stale_running"] >= 1
    assert payload["alerts"][0]["code"] == "stale_image_jobs_detected"
