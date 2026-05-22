from __future__ import annotations

import base64
from dataclasses import dataclass
from io import BytesIO

from fastapi.testclient import TestClient
from PIL import Image

from apps.api.app.domains.auth.ownership import OwnerContext
from apps.api.app.domains.auth.service import create_admin_account
from apps.api.app.domains.llm.service import extract_image_reference
from apps.api.app.infra.db.session import initialize_database, session_scope
from apps.api.app.infra.storage.factory import build_asset_storage
from apps.api.app.main import create_app
from apps.worker.worker.tasks import image_jobs as worker_image_jobs


VALID_PNG_BYTES = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII="
)


def build_jpeg_bytes() -> bytes:
    output = BytesIO()
    Image.new("RGB", (1, 1), color=(255, 255, 255)).save(output, format="JPEG")
    return output.getvalue()


VALID_JPEG_BYTES = build_jpeg_bytes()


def build_client() -> TestClient:
    initialize_database()
    return TestClient(create_app())


def seed_admin() -> None:
    with session_scope() as session:
        create_admin_account(session=session, username="root", password="admin-pass")


def admin_login(client: TestClient) -> None:
    response = client.post("/api/admin/auth/login", json={"username": "root", "password": "admin-pass"})
    assert response.status_code == 200


def register_user(client: TestClient, *, email: str = "provider@example.com") -> dict:
    response = client.post("/api/public/auth/register", json={"email": email, "password": "top-secret"})
    assert response.status_code == 201
    return response.json()["data"]


def create_openai_provider(client: TestClient) -> dict[str, object]:
    response = client.post(
        "/api/admin/providers",
        json={
            "name": "openai-main",
            "type": "openai-compatible",
            "base_url": "https://example.test/v1",
            "api_key_env": "OPENAI_PROVIDER_KEY",
            "default_model": "gpt-image-1",
        },
    )
    assert response.status_code == 201
    return response.json()["data"]


def create_sellable_model(client: TestClient, *, provider_id: int) -> dict[str, object]:
    response = client.post(
        "/api/admin/models",
        json={
            "code": "remote-image",
            "display_name": "Remote Image",
            "capability": "image",
            "public_enabled": True,
            "provider_id": provider_id,
            "provider_model": "gpt-image-1",
        },
    )
    assert response.status_code == 201
    return response.json()["data"]


@dataclass
class FakeHttpResponse:
    status_code: int
    payload: dict[str, object]
    headers: dict[str, str]

    @property
    def text(self) -> str:
        return str(self.payload)

    def json(self) -> dict[str, object]:
        return self.payload


def test_create_openai_provider_requires_base_url_and_key() -> None:
    client = build_client()
    seed_admin()
    admin_login(client)

    response = client.post(
        "/api/admin/providers",
        json={"name": "broken-openai", "type": "openai-compatible"},
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "provider_config_invalid"


def test_admin_can_create_openai_provider_and_model() -> None:
    client = build_client()
    seed_admin()
    admin_login(client)

    provider = create_openai_provider(client)
    model = create_sellable_model(client, provider_id=provider["id"])
    models_response = client.get("/api/admin/models")
    public_models_response = client.get("/api/public/models")

    assert provider["type"] == "openai-compatible"
    assert provider["base_url"] == "https://example.test/v1"
    assert provider["api_key_env"] == "OPENAI_PROVIDER_KEY"
    assert model["provider_id"] == provider["id"]
    assert model["provider_model"] == "gpt-image-1"
    assert any(item["code"] == "remote-image" for item in models_response.json()["data"])
    assert any(item["code"] == "remote-image" for item in public_models_response.json()["data"])



def test_openai_compatible_job_uses_http_adapter(monkeypatch) -> None:
    client = build_client()
    seed_admin()
    admin_login(client)
    provider = create_openai_provider(client)
    create_sellable_model(client, provider_id=provider["id"])
    register_user(client)
    captured: dict[str, object] = {}

    def fake_post(url: str, *, headers: dict[str, str], json: dict[str, object], timeout: float):
        captured["url"] = url
        captured["headers"] = headers
        captured["json"] = json
        captured["timeout"] = timeout
        payload = {
            "data": [{"b64_json": base64.b64encode(VALID_PNG_BYTES).decode("ascii")}],
            "output_format": "png",
        }
        return FakeHttpResponse(status_code=200, payload=payload, headers={"x-request-id": "req-openai-1"})

    monkeypatch.setenv("OPENAI_PROVIDER_KEY", "sk-test")
    monkeypatch.setattr("apps.api.app.domains.llm.openai_image.httpx.post", fake_post)
    create_response = client.post(
        "/api/public/image/jobs",
        json={"prompt": "Remote skyline", "model_code": "remote-image", "requested_count": 1},
    )
    assert create_response.status_code == 201
    job_id = create_response.json()["data"]["id"]

    processed_job_id = worker_image_jobs.run_next_image_job()
    job_response = client.get(f"/api/public/image/jobs/{job_id}")
    results_response = client.get(f"/api/public/image/jobs/{job_id}/results")

    assert processed_job_id == job_id
    assert captured["url"] == "https://example.test/v1/images/generations"
    assert captured["headers"]["Authorization"] == "Bearer sk-test"
    assert captured["json"]["model"] == "gpt-image-1"
    assert captured["json"]["prompt"] == "Remote skyline"
    assert job_response.json()["data"]["status"] == "succeeded"
    assert results_response.json()["data"][0]["provider_request_id"] == "req-openai-1"


def test_openai_compatible_edit_job_uses_multipart_adapter(monkeypatch) -> None:
    client = build_client()
    seed_admin()
    admin_login(client)
    provider = create_openai_provider(client)
    create_sellable_model(client, provider_id=provider["id"])
    register_user(client, email="provider-edit@example.com")
    upload_response = client.post(
        "/api/public/image/uploads",
        files={"file": ("source.png", VALID_PNG_BYTES, "image/png")},
    )
    captured: dict[str, object] = {}

    def fake_post(url: str, *, headers, data=None, files=None, timeout: float, **_kwargs):
        image_file = files["image"]
        captured["url"] = url
        captured["headers"] = headers
        captured["data"] = data
        captured["filename"] = image_file[0]
        captured["mime_type"] = image_file[2]
        captured["content"] = image_file[1].read()
        captured["timeout"] = timeout
        payload = {"data": [{"b64_json": base64.b64encode(VALID_PNG_BYTES).decode("ascii")}]}
        return FakeHttpResponse(status_code=200, payload=payload, headers={"x-request-id": "req-edit-1"})

    monkeypatch.setenv("OPENAI_PROVIDER_KEY", "sk-test")
    monkeypatch.setattr("apps.api.app.domains.llm.openai_image.httpx.post", fake_post)
    create_response = client.post(
        "/api/public/image/jobs",
        json={
            "prompt": "Make the source dog watercolor",
            "model_code": "remote-image",
            "requested_count": 1,
            "mode": "edit",
            "source_asset_id": upload_response.json()["data"]["id"],
        },
    )

    assert create_response.status_code == 201
    job_id = create_response.json()["data"]["id"]
    processed_job_id = worker_image_jobs.run_next_image_job()
    results_response = client.get(f"/api/public/image/jobs/{job_id}/results")

    assert processed_job_id == job_id
    assert captured["url"] == "https://example.test/v1/images/edits"
    assert captured["headers"] == {"Authorization": "Bearer sk-test"}
    assert captured["data"]["model"] == "gpt-image-1"
    assert captured["data"]["prompt"] == "Make the source dog watercolor"
    assert captured["filename"].startswith("upload-")
    assert captured["mime_type"] == "image/png"
    assert captured["content"] == VALID_PNG_BYTES
    assert results_response.json()["data"][0]["provider_request_id"] == "req-edit-1"


def test_openai_compatible_reference_assets_use_multipart_adapter(monkeypatch) -> None:
    client = build_client()
    seed_admin()
    admin_login(client)
    provider = create_openai_provider(client)
    create_sellable_model(client, provider_id=provider["id"])
    user = register_user(client, email="provider-reference@example.com")
    captured: dict[str, object] = {}

    with session_scope() as session:
        from apps.api.app.domains.image.models import Asset
        from apps.api.app.domains.image.service import create_job

        owner = OwnerContext(user_id=user["id"], anonymous_session_id=None)
        first_asset = Asset(owner_user_id=user["id"], storage_path="references/ref-a.png", mime_type="image/png")
        second_asset = Asset(owner_user_id=user["id"], storage_path="references/ref-b.png", mime_type="image/png")
        session.add_all([first_asset, second_asset])
        session.flush()
        storage = build_asset_storage()
        storage.write_bytes(first_asset.storage_path, b"ref-a", first_asset.mime_type)
        storage.write_bytes(second_asset.storage_path, b"ref-b", second_asset.mime_type)
        job = create_job(
            session,
            owner=owner,
            source="member",
            prompt="Use character references",
            model_code="remote-image",
            requested_count=1,
            mode="generate",
            reference_asset_ids=[first_asset.id, second_asset.id],
        )
        job_id = job.id

    def fake_post(url: str, *, headers, data=None, files=None, timeout: float, **_kwargs):
        captured["url"] = url
        captured["headers"] = headers
        captured["data"] = data
        captured["file_fields"] = [item[0] for item in files]
        captured["filenames"] = [item[1][0] for item in files]
        captured["contents"] = [item[1][1].read() for item in files]
        captured["timeout"] = timeout
        payload = {"data": [{"b64_json": base64.b64encode(VALID_PNG_BYTES).decode("ascii")}]}
        return FakeHttpResponse(status_code=200, payload=payload, headers={"x-request-id": "req-ref-1"})

    monkeypatch.setenv("OPENAI_PROVIDER_KEY", "sk-test")
    monkeypatch.setattr("apps.api.app.domains.llm.openai_image.httpx.post", fake_post)
    processed_job_id = worker_image_jobs.run_next_image_job()
    results_response = client.get(f"/api/public/image/jobs/{job_id}/results")

    assert processed_job_id == job_id
    assert captured["url"] == "https://example.test/v1/images/edits"
    assert captured["headers"] == {"Authorization": "Bearer sk-test"}
    assert captured["file_fields"] == ["image", "image"]
    assert captured["filenames"] == ["ref-a.png", "ref-b.png"]
    assert captured["contents"] == [b"ref-a", b"ref-b"]
    assert results_response.json()["data"][0]["provider_request_id"] == "req-ref-1"


def test_public_image_job_accepts_reference_asset_ids(monkeypatch) -> None:
    client = build_client()
    seed_admin()
    admin_login(client)
    provider = create_openai_provider(client)
    create_sellable_model(client, provider_id=provider["id"])
    register_user(client, email="provider-public-reference@example.com")
    first_upload = client.post("/api/public/image/uploads", files={"file": ("first.png", VALID_PNG_BYTES, "image/png")})
    second_upload = client.post("/api/public/image/uploads", files={"file": ("second.jpg", VALID_JPEG_BYTES, "image/jpeg")})
    captured: dict[str, object] = {}

    def fake_post(url: str, *, headers, data=None, files=None, timeout: float, **_kwargs):
        captured["url"] = url
        captured["headers"] = headers
        captured["data"] = data
        captured["file_fields"] = [item[0] for item in files or []]
        captured["filenames"] = [item[1][0] for item in files or []]
        captured["contents"] = [item[1][1].read() for item in files or []]
        captured["timeout"] = timeout
        payload = {"data": [{"b64_json": base64.b64encode(VALID_PNG_BYTES).decode("ascii")}]}
        return FakeHttpResponse(status_code=200, payload=payload, headers={"x-request-id": "req-public-ref-1"})

    monkeypatch.setenv("OPENAI_PROVIDER_KEY", "sk-test")
    monkeypatch.setattr("apps.api.app.domains.llm.openai_image.httpx.post", fake_post)
    create_response = client.post(
        "/api/public/image/jobs",
        json={
            "prompt": "Use both public references",
            "model_code": "remote-image",
            "requested_count": 1,
            "mode": "generate",
            "reference_asset_ids": [first_upload.json()["data"]["id"], second_upload.json()["data"]["id"]],
        },
    )

    assert create_response.status_code == 201
    job_id = create_response.json()["data"]["id"]
    processed_job_id = worker_image_jobs.run_next_image_job()
    results_response = client.get(f"/api/public/image/jobs/{job_id}/results")

    assert processed_job_id == job_id
    assert captured["url"] == "https://example.test/v1/images/edits"
    assert captured["headers"] == {"Authorization": "Bearer sk-test"}
    assert captured["file_fields"] == ["image", "image"]
    assert captured["filenames"] == ["upload-1.png", "upload-2.jpg"]
    assert captured["contents"] == [VALID_PNG_BYTES, VALID_JPEG_BYTES]
    assert results_response.json()["data"][0]["provider_request_id"] == "req-public-ref-1"


def test_openai_job_fails_when_api_key_env_missing(monkeypatch) -> None:
    client = build_client()
    seed_admin()
    admin_login(client)
    provider = create_openai_provider(client)
    create_sellable_model(client, provider_id=provider["id"])
    register_user(client, email="missing-key@example.com")
    monkeypatch.setattr("apps.api.app.domains.image.service.IMAGE_JOB_MAX_ATTEMPTS", 1)
    create_response = client.post(
        "/api/public/image/jobs",
        json={"prompt": "Missing key", "model_code": "remote-image", "requested_count": 1},
    )
    assert create_response.status_code == 201
    job_id = create_response.json()["data"]["id"]

    processed_job_id = worker_image_jobs.run_next_image_job()
    job_response = client.get(f"/api/public/image/jobs/{job_id}")

    assert processed_job_id == job_id
    assert job_response.json()["data"]["status"] == "failed"
    assert "OPENAI_PROVIDER_KEY" in job_response.json()["data"]["error_message"]


def test_updating_model_visibility_keeps_image_jobs_without_local_billing() -> None:
    client = build_client()
    seed_admin()
    admin_login(client)
    models_response = client.get("/api/admin/models")
    image_model = next(item for item in models_response.json()["data"] if item["code"] == "gpt-image-2")

    response = client.patch(
        "/api/admin/models/gpt-image-2",
        json={
            "display_name": "GPT Image 2",
            "capability": "image",
            "provider_id": image_model["provider_id"],
            "provider_model": "gpt-image-2",
            "public_enabled": True,
        },
    )
    assert response.status_code == 200

    register_user(client, email="visibility@example.com")
    create_response = client.post(
        "/api/public/image/jobs",
        json={"prompt": "Priced job", "model_code": "gpt-image-2", "requested_count": 1},
    )

    assert create_response.status_code == 201
    assert "charge_cents" not in create_response.json()["data"]



def write_reference_file(filename: str, content: bytes) -> str:
    from pathlib import Path
    from apps.api.app.core.config import get_settings

    path = Path(get_settings().generated_assets_dir) / filename
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)
    return str(path)
