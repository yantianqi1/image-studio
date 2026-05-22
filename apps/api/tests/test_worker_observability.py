from __future__ import annotations

from datetime import datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import text

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


def test_admin_ops_can_list_drain_and_resume_worker_nodes():
    client = build_client()
    seed_admin()
    with session_scope() as session:
        seed_worker_node(session, worker_id="worker-a", status="running")
    admin_login(client)

    list_response = client.get("/api/admin/ops/workers")
    drain_response = client.post("/api/admin/ops/workers/worker-a/drain")
    resume_response = client.post("/api/admin/ops/workers/worker-a/resume")

    assert list_response.status_code == 200
    assert list_response.json()["data"]["items"][0]["id"] == "worker-a"
    assert drain_response.status_code == 200
    assert drain_response.json()["data"]["status"] == "draining"
    assert resume_response.status_code == 200
    assert resume_response.json()["data"]["status"] == "running"
    with session_scope() as session:
        status = session.execute(text("SELECT status FROM worker_nodes WHERE id = 'worker-a'")).scalar_one()
        assert status == "running"


def test_admin_ops_queue_summary_reports_item_counts():
    client = build_client()
    register_user(client)
    job_id = create_job(client)
    with session_scope() as session:
        mark_job_item_running(session, job_id=job_id, worker_id="go-worker-a", stale=True)
    seed_admin()
    admin_login(client)

    response = client.get("/api/admin/ops/image/queue-summary")

    assert response.status_code == 200
    payload = response.json()["data"]
    assert payload["items"]["running"] == 1
    assert payload["items"]["queued"] == 0
    assert payload["items"]["dead_letter"] == 0
    assert payload["stale_running"] == 1


def test_admin_ops_running_items_lists_lock_context():
    client = build_client()
    register_user(client)
    job_id = create_job(client)
    with session_scope() as session:
        mark_job_item_running(session, job_id=job_id, worker_id="go-worker-b", stale=False)
    seed_admin()
    admin_login(client)

    response = client.get("/api/admin/ops/image/running-items")

    assert response.status_code == 200
    item = response.json()["data"]["items"][0]
    assert item["job_id"] == job_id
    assert item["result_index"] == 1
    assert item["locked_by"] == "go-worker-b"
    assert item["model_code"] == "gpt-image-2"


def seed_worker_node(session, *, worker_id: str, status: str) -> None:
    session.execute(
        text(
            """
            INSERT INTO worker_nodes (
              id, worker_name, hostname, version, status, mode, concurrency,
              started_at, last_heartbeat_at, metadata
            ) VALUES (
              :id, 'worker-a', 'host-a', 'test', :status, 'render', 2,
              CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, '{}'
            )
            """
        ),
        {"id": worker_id, "status": status},
    )


def mark_job_item_running(session, *, job_id: int, worker_id: str, stale: bool) -> None:
    lease_expires_at = datetime.utcnow() - timedelta(seconds=60) if stale else datetime.utcnow() + timedelta(seconds=60)
    session.execute(
        text(
            """
            UPDATE image_job_items
            SET status = 'running',
                locked_by = :worker_id,
                locked_at = CURRENT_TIMESTAMP,
                started_at = CURRENT_TIMESTAMP,
                heartbeat_at = CURRENT_TIMESTAMP,
                lease_expires_at = :lease_expires_at
            WHERE job_id = :job_id
            """
        ),
        {"job_id": job_id, "worker_id": worker_id, "lease_expires_at": lease_expires_at},
    )
