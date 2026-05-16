from datetime import datetime, timedelta
import inspect

from fastapi.testclient import TestClient
from sqlalchemy import select

from apps.api.app.domains.auth.service import create_admin_account
from apps.api.app.domains.image import stats_service
from apps.api.app.domains.image import service as image_service
from apps.api.app.domains.image.models import ImageJob, ImageJobResult
from apps.api.app.domains.llm.service import RenderedImage
from apps.api.app.infra.db.session import initialize_database, session_scope
from apps.api.app.main import create_app
from apps.worker.worker.tasks import image_jobs as worker_image_jobs


def build_client() -> TestClient:
    initialize_database()
    return TestClient(create_app())


def register_user(client: TestClient) -> None:
    response = client.post(
        "/api/public/auth/register",
        json={"email": "admin-image@example.com", "password": "top-secret"},
    )
    assert response.status_code == 201


def seed_admin() -> None:
    with session_scope() as session:
        create_admin_account(session=session, username="root", password="admin-pass")


def admin_login(client: TestClient) -> None:
    response = client.post("/api/admin/auth/login", json={"username": "root", "password": "admin-pass"})
    assert response.status_code == 200


def create_image_job(client: TestClient, *, prompt: str) -> dict[str, object]:
    response = client.post(
        "/api/public/image/jobs",
        json={"prompt": prompt, "model_code": "gpt-image-2", "requested_count": 1},
    )
    assert response.status_code == 201
    return response.json()["data"]


def build_rendered_image_from_job(_session=None, *, prompt: str, model_code: str, **_kwargs) -> RenderedImage:
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32">'
        f"<text>{prompt}:{model_code}</text>"
        "</svg>"
    )
    return RenderedImage(
        content=svg.encode("utf-8"),
        mime_type="image/svg+xml",
        revised_prompt=prompt,
        provider_request_id=f"test:{model_code}",
    )


def test_admin_image_jobs_include_results(monkeypatch):
    monkeypatch.setattr(image_service, "render_image", build_rendered_image_from_job, raising=False)
    client = build_client()
    register_user(client)
    seed_admin()
    job = create_image_job(client, prompt="Admin visible image")
    worker_image_jobs.run_next_image_job()
    admin_login(client)

    response = client.get("/api/admin/image/jobs")

    assert response.status_code == 200
    jobs = response.json()["data"]
    target = next(item for item in jobs if item["id"] == job["id"])
    assert target["results"][0]["asset_url"].startswith("/api/admin/image/assets/")
    assert target["results"][0]["revised_prompt"] == "Admin visible image"


def test_admin_image_jobs_paginated_include_parameters_and_costs():
    client = build_client()
    seed_admin()
    now = datetime.utcnow()
    with session_scope() as session:
        session.add(
            ImageJob(
                source="member",
                mode="generate",
                prompt="Dense log payload",
                model_code="gpt-image-2",
                provider_model="upstream-image-model",
                status="failed",
                requested_count=2,
                charge_cents=500,
                size="1024x1024",
                quality="high",
                provider_input_tokens=11,
                provider_output_tokens=22,
                provider_total_tokens=33,
                raw_provider_cost_cents=120,
                provider_fee_cents=30,
                internal_cost_cents=150,
                error_code="provider_error",
                error_message="upstream failed",
                started_at=now,
                finished_at=now + timedelta(seconds=3),
            )
        )
    admin_login(client)

    response = client.get("/api/admin/image/jobs?paginated=1&page=1&page_size=10")

    assert response.status_code == 200
    payload = response.json()["data"]
    job = payload["items"][0]
    assert payload["total"] == 1
    assert job["size"] == "1024x1024"
    assert job["quality"] == "high"
    assert job["charge_cents"] == 500
    assert job["provider_total_tokens"] == 33
    assert job["raw_provider_cost_cents"] == 120
    assert job["provider_fee_cents"] == 30
    assert job["internal_cost_cents"] == 150
    assert job["error_code"] == "provider_error"
    assert job["results"] == []


def test_admin_can_read_any_image_job_result_asset(monkeypatch):
    monkeypatch.setattr(image_service, "render_image", build_rendered_image_from_job, raising=False)
    client = build_client()
    register_user(client)
    seed_admin()
    job = create_image_job(client, prompt="Cross owner admin image")
    worker_image_jobs.run_next_image_job()
    with session_scope() as session:
        result = session.execute(select(ImageJobResult).where(ImageJobResult.job_id == job["id"])).scalar_one()
        asset_id = result.asset_id
    admin_login(client)

    response = client.get(f"/api/admin/image/assets/{asset_id}")

    assert response.status_code == 200
    assert "Cross owner admin image" in response.text


def test_admin_image_stats_returns_duration_without_sqlite_julianday():
    client = build_client()
    seed_admin()
    now = datetime.utcnow()
    with session_scope() as session:
        session.add(
            ImageJob(
                source="admin",
                mode="generate",
                prompt="Stats duration image",
                model_code="gpt-image-2",
                status="succeeded",
                requested_count=1,
                charge_cents=250,
                started_at=now,
                finished_at=now + timedelta(seconds=12),
            )
        )
    admin_login(client)

    response = client.get("/api/admin/image/stats")

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["performance"]["avg_duration_seconds"] == 12.0
    assert data["revenue"]["total_cents"] == 250
    assert "julianday" not in inspect.getsource(stats_service._avg_duration)
