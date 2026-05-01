from __future__ import annotations

from io import BytesIO

from fastapi.testclient import TestClient
from PIL import Image

from apps.api.app.domains.image import service as image_service
from apps.api.app.domains.llm.service import RenderedImage
from apps.api.app.infra.db.session import initialize_database
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


def fake_renderer(_session=None, **kwargs) -> RenderedImage:
    svg = f'<svg xmlns="http://www.w3.org/2000/svg"><text>{kwargs["prompt"]}</text></svg>'
    return RenderedImage(
        content=svg.encode("utf-8"),
        mime_type="image/svg+xml",
        revised_prompt=f"revised:{kwargs['prompt']}",
        provider_request_id="gallery-test",
    )


def png_renderer(_session=None, **kwargs) -> RenderedImage:
    buffer = BytesIO()
    Image.new("RGB", (1200, 600), color=(16, 24, 39)).save(buffer, format="PNG")
    return RenderedImage(
        content=buffer.getvalue(),
        mime_type="image/png",
        revised_prompt=f"revised:{kwargs['prompt']}",
        provider_request_id="gallery-png-test",
    )


def create_image_job(client: TestClient, *, prompt: str, visibility: str | None = None) -> dict:
    payload = {"prompt": prompt, "model_code": "gpt-image-2", "requested_count": 1}
    if visibility is not None:
        payload["visibility"] = visibility
    response = client.post("/api/public/image/jobs", json=payload)
    assert response.status_code == 201
    return response.json()["data"]


def complete_image_job(client: TestClient, *, prompt: str, visibility: str | None = None) -> dict:
    job = create_image_job(client, prompt=prompt, visibility=visibility)
    assert worker_image_jobs.run_next_image_job() == job["id"]
    results_response = client.get(f"/api/public/image/jobs/{job['id']}/results")
    assert results_response.status_code == 200
    return results_response.json()["data"][0]


def gallery_items(client: TestClient, scope: str) -> list[dict]:
    response = client.get(f"/api/public/image/gallery?scope={scope}")
    assert response.status_code == 200
    return response.json()["data"]


def test_image_job_defaults_to_private_visibility(monkeypatch):
    monkeypatch.setattr(image_service, "render_image", fake_renderer, raising=False)
    client = build_client()
    register_user(client, "private-default@example.com")

    result = complete_image_job(client, prompt="Private by default")

    assert result["visibility"] == "private"
    assert gallery_items(client, "mine")[0]["asset_id"] == result["asset_id"]
    assert gallery_items(client, "public") == []


def test_public_image_job_publishes_rendered_asset(monkeypatch):
    monkeypatch.setattr(image_service, "render_image", fake_renderer, raising=False)
    alice = build_client()
    register_user(alice, "public-owner@example.com")

    result = complete_image_job(alice, prompt="Public render", visibility="public")
    public_items = gallery_items(alice, "public")
    bob = new_client()
    register_user(bob, "public-reader@example.com")

    assert result["visibility"] == "public"
    assert result["published_at"] is not None
    assert public_items[0]["asset_id"] == result["asset_id"]
    assert bob.get(result["asset_url"]).status_code == 200


def test_gallery_items_include_thumbnail_url(monkeypatch):
    monkeypatch.setattr(image_service, "render_image", fake_renderer, raising=False)
    client = build_client()
    register_user(client, "thumbnail-url@example.com")
    result = complete_image_job(client, prompt="Thumbnail url")

    item = gallery_items(client, "mine")[0]

    assert item["asset_url"] == result["asset_url"]
    assert item["thumbnail_url"] == f"/api/public/image/assets/{result['asset_id']}/thumbnail"


def test_thumbnail_endpoint_preserves_aspect_ratio(monkeypatch):
    monkeypatch.setattr(image_service, "render_image", png_renderer, raising=False)
    client = build_client()
    register_user(client, "thumbnail-ratio@example.com")
    result = complete_image_job(client, prompt="Wide image")

    response = client.get(result["thumbnail_url"])
    image = Image.open(BytesIO(response.content))

    assert response.status_code == 200
    assert response.headers["content-type"] == "image/jpeg"
    assert image.size == (640, 320)


def test_gallery_mine_lists_only_owner_assets(monkeypatch):
    monkeypatch.setattr(image_service, "render_image", fake_renderer, raising=False)
    alice = build_client()
    register_user(alice, "gallery-alice@example.com")
    alice_result = complete_image_job(alice, prompt="Alice image")
    bob = new_client()
    register_user(bob, "gallery-bob@example.com")
    bob_result = complete_image_job(bob, prompt="Bob image")

    alice_asset_ids = {item["asset_id"] for item in gallery_items(alice, "mine")}
    bob_asset_ids = {item["asset_id"] for item in gallery_items(bob, "mine")}

    assert alice_asset_ids == {alice_result["asset_id"]}
    assert bob_asset_ids == {bob_result["asset_id"]}


def test_visibility_toggle_requires_asset_owner(monkeypatch):
    monkeypatch.setattr(image_service, "render_image", fake_renderer, raising=False)
    alice = build_client()
    register_user(alice, "toggle-owner@example.com")
    result = complete_image_job(alice, prompt="Toggle me")
    bob = new_client()
    register_user(bob, "toggle-bob@example.com")

    forbidden_response = bob.patch(f"/api/public/image/assets/{result['asset_id']}/visibility", json={"visibility": "public"})
    update_response = alice.patch(f"/api/public/image/assets/{result['asset_id']}/visibility", json={"visibility": "public"})

    assert forbidden_response.status_code == 404
    assert update_response.status_code == 200
    assert update_response.json()["data"]["visibility"] == "public"
    assert gallery_items(bob, "public")[0]["asset_id"] == result["asset_id"]


def test_private_asset_file_stays_owner_scoped(monkeypatch):
    monkeypatch.setattr(image_service, "render_image", fake_renderer, raising=False)
    alice = build_client()
    register_user(alice, "private-file-owner@example.com")
    result = complete_image_job(alice, prompt="Private file")
    bob = new_client()
    register_user(bob, "private-file-bob@example.com")

    assert alice.get(result["asset_url"]).status_code == 200
    assert bob.get(result["asset_url"]).status_code == 404


def test_private_thumbnail_file_stays_owner_scoped(monkeypatch):
    monkeypatch.setattr(image_service, "render_image", fake_renderer, raising=False)
    alice = build_client()
    register_user(alice, "private-thumbnail-owner@example.com")
    result = complete_image_job(alice, prompt="Private thumbnail")
    bob = new_client()
    register_user(bob, "private-thumbnail-bob@example.com")

    assert alice.get(result["thumbnail_url"]).status_code == 200
    assert bob.get(result["thumbnail_url"]).status_code == 404
