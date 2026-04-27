from __future__ import annotations

from datetime import datetime, timezone

from fastapi.testclient import TestClient

from apps.api.app.domains.auth.service import create_admin_account
from apps.api.app.domains.settings.service import get_settings_record
from apps.api.app.infra.db.session import initialize_database, session_scope
from apps.api.app.main import create_app


def seed_admin() -> None:
    initialize_database()
    with session_scope() as session:
        create_admin_account(session=session, username="root", password="admin-pass")


def admin_login(client: TestClient) -> None:
    response = client.post("/api/admin/auth/login", json={"username": "root", "password": "admin-pass"})
    assert response.status_code == 200


def update_public_quota_settings(mode: str = "daily_global", daily_limit: int = 20, per_ip_limit: int = 20) -> None:
    with session_scope() as session:
        record = get_settings_record(session)
        record.public_quota_mode = mode
        record.public_quota_daily_global_limit = daily_limit
        record.public_quota_per_ip_limit = per_ip_limit
        session.flush()


def create_public_image_job(client: TestClient, prompt: str = "Shared quota image") -> dict[str, object]:
    response = client.post(
        "/api/public/image/jobs",
        json={"prompt": prompt, "model_code": "gpt-image-2", "requested_count": 1},
    )
    assert response.status_code == 201
    return response.json()["data"]


def create_comic_project(client: TestClient, title: str = "Shared Quota Comic") -> dict[str, object]:
    response = client.post(
        "/api/public/comic/projects",
        json={"title": title, "description": "quota test", "genre": "Sci-Fi"},
    )
    assert response.status_code == 201
    return response.json()["data"]


def create_comic_scene(client: TestClient, project_id: str) -> None:
    client.put(
        f"/api/public/comic/projects/{project_id}/chapters/chapter-001",
        json={"title": "Chapter", "summary": "quota test", "sequence": 1},
    )
    client.put(
        f"/api/public/comic/projects/{project_id}/chapters/chapter-001/scenes/scene-001",
        json={
            "title": "Scene",
            "summary": "quota test",
            "sequence": 1,
            "shots": ["Wide shot"],
        },
    )


def create_comic_task(client: TestClient, project_id: str) -> dict[str, object]:
    response = client.post(
        "/api/public/comic/tasks",
        json={
            "project_id": project_id,
            "chapter_id": "chapter-001",
            "scene_id": "scene-001",
            "task_type": "scene-render",
            "input_payload": {
                "source_text": "A courier reaches the dock.",
                "style_preset": "ink_wash",
                "panels_per_image": 4,
                "target_image_count": 1,
                "generate_images": False,
            },
        },
    )
    assert response.status_code == 201
    return response.json()["data"]


def test_admin_settings_exposes_public_quota_fields(client: TestClient) -> None:
    seed_admin()
    admin_login(client)

    response = client.get("/api/admin/settings")

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["public_quota_mode"] == "daily_global"
    assert data["public_quota_daily_global_limit"] == 20
    assert data["public_quota_per_ip_limit"] == 20


def test_admin_can_update_public_quota_settings(client: TestClient) -> None:
    seed_admin()
    admin_login(client)

    response = client.patch(
        "/api/admin/settings",
        json={
            "site_title": "image Studio",
            "allow_public_signup": True,
            "allow_anonymous_image": True,
            "uploads_enabled": True,
            "public_quota_mode": "per_ip",
            "public_quota_daily_global_limit": 8,
            "public_quota_per_ip_limit": 3,
        },
    )

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["public_quota_mode"] == "per_ip"
    assert data["public_quota_daily_global_limit"] == 8
    assert data["public_quota_per_ip_limit"] == 3


def test_admin_rejects_zero_public_quota_limit(client: TestClient) -> None:
    seed_admin()
    admin_login(client)

    response = client.patch(
        "/api/admin/settings",
        json={
            "site_title": "image Studio",
            "allow_public_signup": True,
            "allow_anonymous_image": True,
            "uploads_enabled": True,
            "public_quota_mode": "daily_global",
            "public_quota_daily_global_limit": 0,
            "public_quota_per_ip_limit": 1,
        },
    )

    assert response.status_code == 422


def test_public_quota_is_shared_between_image_and_comic(client: TestClient) -> None:
    seed_admin()
    admin_login(client)
    update_public_quota_settings(mode="daily_global", daily_limit=2, per_ip_limit=5)

    image_job = create_public_image_job(client, prompt="First public image")
    project = create_comic_project(client)
    create_comic_scene(client, project["id"])
    comic_task = create_comic_task(client, project["id"])
    exhausted_response = client.post(
        "/api/public/image/jobs",
        json={"prompt": "Third public request", "model_code": "gpt-image-2", "requested_count": 1},
    )

    assert image_job["source"] == "anonymous"
    assert comic_task["status"] == "pending"
    assert exhausted_response.status_code == 403
    assert exhausted_response.json()["error"]["code"] == "public_quota_exhausted"


def test_public_quota_bypasses_login_and_client_provider_requests() -> None:
    seed_admin()
    member_client = TestClient(create_app())
    anon_client = TestClient(create_app())
    admin_login(member_client)
    update_public_quota_settings(mode="daily_global", daily_limit=1, per_ip_limit=5)

    register_response = member_client.post(
        "/api/public/auth/register",
        json={"email": "member@example.com", "password": "top-secret"},
    )
    assert register_response.status_code == 201
    member_job = create_public_image_job(member_client, prompt="Member image")
    anonymous_job = create_public_image_job(anon_client, prompt="Anonymous image")
    client_provider_job = anon_client.post(
        "/api/public/image/jobs",
        headers={
            "x-client-id": "browser-1",
            "x-client-provider-base-url": "https://client.example/v1",
            "x-client-provider-api-key": "sk-client-provider",
        },
        json={"prompt": "Client provider image", "model_code": "gpt-image-2", "requested_count": 1},
    )

    assert member_job["source"] == "member"
    assert anonymous_job["source"] == "anonymous"
    assert client_provider_job.status_code == 201
    assert client_provider_job.json()["data"]["source"] == "client_provider"


def test_per_ip_quota_limits_each_ip_independently(client: TestClient) -> None:
    seed_admin()
    admin_login(client)
    update_public_quota_settings(mode="per_ip", daily_limit=5, per_ip_limit=1)

    first_ip_response = client.post(
        "/api/public/image/jobs",
        headers={"x-forwarded-for": "203.0.113.10"},
        json={"prompt": "First IP image", "model_code": "gpt-image-2", "requested_count": 1},
    )
    same_ip_response = client.post(
        "/api/public/image/jobs",
        headers={"x-forwarded-for": "203.0.113.10"},
        json={"prompt": "Same IP image", "model_code": "gpt-image-2", "requested_count": 1},
    )
    different_ip_response = client.post(
        "/api/public/image/jobs",
        headers={"x-forwarded-for": "203.0.113.11"},
        json={"prompt": "Different IP image", "model_code": "gpt-image-2", "requested_count": 1},
    )

    assert first_ip_response.status_code == 201
    assert same_ip_response.status_code == 403
    assert same_ip_response.json()["error"]["code"] == "public_quota_exhausted"
    assert different_ip_response.status_code == 201


def test_daily_global_quota_resets_at_beijing_midnight() -> None:
    seed_admin()
    update_public_quota_settings(mode="daily_global", daily_limit=1, per_ip_limit=5)

    from apps.api.app.domains.public_quota.service import consume_public_quota

    with session_scope() as session:
        first_result = consume_public_quota(
            session,
            request_ip="203.0.113.9",
            feature="image",
            reference_type="image_job",
            reference_id="job-1",
            now=datetime(2026, 4, 27, 15, 59, 59, tzinfo=timezone.utc),
        )
        second_result = consume_public_quota(
            session,
            request_ip="203.0.113.9",
            feature="comic",
            reference_type="comic_task",
            reference_id="task-1",
            now=datetime(2026, 4, 27, 16, 0, 0, tzinfo=timezone.utc),
        )

    assert first_result is not None
    assert second_result is not None
