from __future__ import annotations

from fastapi.testclient import TestClient

from apps.api.app.domains.auth.service import create_admin_account
from apps.api.app.domains.image import service as image_service
from apps.api.app.domains.llm.service import RenderedImage
from apps.api.app.infra.db.session import initialize_database, session_scope
from apps.api.app.main import create_app
from apps.worker.worker.tasks import image_jobs as worker_image_jobs


def build_client() -> TestClient:
    initialize_database()
    return TestClient(create_app())


def new_client() -> TestClient:
    return TestClient(create_app())


def register_user(client: TestClient, email: str) -> None:
    response = client.post("/api/public/auth/register", json={"email": email, "password": "top-secret"})
    assert response.status_code == 201


def create_image_job(client: TestClient, prompt: str = "Owner scoped image") -> dict:
    response = client.post(
        "/api/public/image/jobs",
        json={"prompt": prompt, "model_code": "gpt-image-2", "requested_count": 1},
    )
    assert response.status_code == 201
    return response.json()["data"]


def upload_asset(client: TestClient) -> dict:
    response = client.post(
        "/api/public/image/uploads",
        files={"file": ("source.png", b"source-image", "image/png")},
    )
    assert response.status_code == 201
    return response.json()["data"]


def fake_rendered_image(*, prompt: str, model_code: str) -> RenderedImage:
    svg = f'<svg xmlns="http://www.w3.org/2000/svg"><text>{prompt}:{model_code}</text></svg>'
    return RenderedImage(
        content=svg.encode("utf-8"),
        mime_type="image/svg+xml",
        revised_prompt=prompt,
        provider_request_id="owner-isolation-test",
    )


def fake_renderer(_session=None, **kwargs) -> RenderedImage:
    return fake_rendered_image(prompt=kwargs["prompt"], model_code=kwargs["model_code"])


def seed_admin() -> None:
    with session_scope() as session:
        create_admin_account(session=session, username="root", password="admin-pass")


def login_admin(client: TestClient) -> None:
    response = client.post("/api/admin/auth/login", json={"username": "root", "password": "admin-pass"})
    assert response.status_code == 200


def test_login_users_cannot_read_each_others_image_jobs_results_or_assets(monkeypatch):
    monkeypatch.setattr(image_service, "render_image", fake_renderer, raising=False)
    alice = build_client()
    register_user(alice, "alice-image@example.com")
    uploaded_asset = upload_asset(alice)
    job = create_image_job(alice)
    worker_image_jobs.run_next_image_job()
    result = alice.get(f"/api/public/image/jobs/{job['id']}/results").json()["data"][0]

    bob = new_client()
    register_user(bob, "bob-image@example.com")

    assert bob.get(f"/api/public/image/jobs/{job['id']}").status_code == 404
    assert bob.get(f"/api/public/image/jobs/{job['id']}/results").status_code == 404
    assert bob.get(result["asset_url"]).status_code == 404
    assert bob.get(uploaded_asset["asset_url"]).status_code == 404


def test_anonymous_browsers_cannot_read_each_others_image_jobs():
    anonymous_a = build_client()
    assert anonymous_a.post("/api/public/auth/anonymous-session").status_code == 201
    job = create_image_job(anonymous_a, prompt="Anonymous A")

    anonymous_b = new_client()
    assert anonymous_b.post("/api/public/auth/anonymous-session").status_code == 201

    assert anonymous_b.get("/api/public/image/jobs").json()["data"] == []
    assert anonymous_b.get(f"/api/public/image/jobs/{job['id']}").status_code == 404
    assert anonymous_b.get(f"/api/public/image/jobs/{job['id']}/results").status_code == 404


def test_admin_can_still_list_all_image_jobs():
    user = build_client()
    register_user(user, "admin-visible-image@example.com")
    job = create_image_job(user, prompt="Admin visible image")
    seed_admin()

    admin = new_client()
    login_admin(admin)
    response = admin.get("/api/admin/image/jobs")

    assert response.status_code == 200
    assert job["id"] in {item["id"] for item in response.json()["data"]}
