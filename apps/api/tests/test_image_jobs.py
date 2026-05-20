import base64
from dataclasses import dataclass
from datetime import datetime, timedelta

from fastapi.testclient import TestClient
import pytest
from sqlalchemy import select

from apps.api.app.core.errors import AppError
from apps.api.app.domains.auth.anonymous_sessions import create_anonymous_session
from apps.api.app.domains.auth.ownership import OwnerContext
from apps.api.app.domains.auth.service import create_admin_account
from apps.api.app.domains.image import direct_rendering
from apps.api.app.domains.image import routes as image_routes
from apps.api.app.domains.image import service as image_service
from apps.api.app.domains.image.models import Asset, ImageJob, ImageJobItem, ImageJobReferenceAsset, ImageJobResult
from apps.api.app.domains.llm.service import RenderedImage
from apps.api.app.infra.db.session import initialize_database, session_scope
from apps.api.app.infra.storage.factory import build_asset_storage
from apps.api.app.main import create_app
from apps.worker.worker.tasks import image_jobs as worker_image_jobs


VALID_PNG_BYTES = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII="
)


@dataclass
class FakeHttpResponse:
    status_code: int
    payload: dict[str, object]
    headers: dict[str, str]
    content: bytes = b""

    @property
    def text(self) -> str:
        return str(self.payload)

    def json(self) -> dict[str, object]:
        return self.payload


def build_client() -> TestClient:
    initialize_database()
    return TestClient(create_app())


def register_user(client: TestClient, *, email: str = "image@example.com"):
    response = client.post(
        "/api/public/auth/register",
        json={"email": email, "password": "top-secret"},
    )
    assert response.status_code == 201
    return response.json()["data"]


def create_image_job(client: TestClient, *, prompt: str = "A paper city under sunrise") -> dict[str, object]:
    response = client.post(
        "/api/public/image/jobs",
        json={"prompt": prompt, "model_code": "gpt-image-2", "requested_count": 1},
    )
    assert response.status_code == 201
    return response.json()["data"]


def create_auto_titled_image_job(client: TestClient, *, prompt: str) -> dict[str, object]:
    response = client.post(
        "/api/public/image/jobs",
        json={"prompt": prompt, "model_code": "gpt-image-2", "requested_count": 1, "auto_title": True},
    )
    assert response.status_code == 201
    return response.json()["data"]


def client_provider_headers(*, client_id: str = "browser-client-1") -> dict[str, str]:
    return {
        "x-client-id": client_id,
        "x-client-provider-base-url": "https://client.example/v1",
        "x-client-provider-api-key": "sk-client-provider",
    }


def client_provider_key_only_headers(*, client_id: str = "browser-client-1") -> dict[str, str]:
    return {
        "x-client-id": client_id,
        "x-client-provider-api-key": "sk-client-provider",
    }


def create_asset(
    session,
    *,
    owner_user_id: int | None,
    storage_path: str,
    owner_anonymous_session_id: int | None = None,
) -> Asset:
    asset = Asset(
        owner_user_id=owner_user_id,
        owner_anonymous_session_id=owner_anonymous_session_id,
        storage_path=storage_path,
        mime_type="image/png",
    )
    session.add(asset)
    session.flush()
    return asset


def create_anonymous_owner(session) -> OwnerContext:
    anonymous_session, _token = create_anonymous_session(session)
    return OwnerContext(user_id=None, anonymous_session_id=anonymous_session.id)


def create_queued_job_for_user(*, user_id: int, prompt: str, model_code: str = "gpt-image-2") -> ImageJob:
    with session_scope() as session:
        job = image_service.create_job(
            session,
            owner=OwnerContext(user_id=user_id, anonymous_session_id=None),
            source="member",
            prompt=prompt,
            model_code=model_code,
            requested_count=1,
            mode="generate",
        )
        session.commit()
        return job


def run_image_worker_for(job_id: int) -> None:
    assert worker_image_jobs.run_next_image_job() == job_id


def fake_client_provider_render(_session=None, *, config, options):
    del config
    return build_rendered_image(prompt=options["prompt"], model_code=options["model_code"])


def list_reference_rows(session, *, job_id: int) -> list[ImageJobReferenceAsset]:
    statement = select(ImageJobReferenceAsset).where(ImageJobReferenceAsset.job_id == job_id)
    return list(session.execute(statement.order_by(ImageJobReferenceAsset.sequence.asc())).scalars())


def build_rendered_image(*, prompt: str, model_code: str) -> RenderedImage:
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


def build_rendered_image_from_job(
    _session=None,
    *,
    prompt: str,
    model_code: str,
    provider_id: int | None = None,
    provider_model: str | None = None,
    **_kwargs,
) -> RenderedImage:
    del provider_id, provider_model
    return build_rendered_image(prompt=prompt, model_code=model_code)


def seed_admin():
    with session_scope() as session:
        create_admin_account(session=session, username="root", password="admin-pass")


def admin_login(client: TestClient):
    response = client.post("/api/admin/auth/login", json={"username": "root", "password": "admin-pass"})
    assert response.status_code == 200


def test_create_image_job_queues_without_direct_rendering(monkeypatch):
    direct_render_calls: list[int] = []

    def direct_render(_session=None, *, job):
        direct_render_calls.append(job.id)
        return job

    monkeypatch.setattr(direct_rendering, "render_job_immediately", direct_render)
    monkeypatch.setattr(image_routes, "render_job_immediately", direct_render, raising=False)
    client = build_client()
    register_user(client)
    response = client.post(
        "/api/public/image/jobs",
        json={"prompt": "A paper city under sunrise", "model_code": "gpt-image-2", "requested_count": 1},
    )

    assert response.status_code == 201
    assert direct_render_calls == []
    job = response.json()["data"]
    assert job["status"] == "queued"
    assert job["attempt_count"] == 0
    assert job["max_attempts"] == 3
    assert job["available_at"] is not None
    assert job["started_at"] is None
    assert job["finished_at"] is None

    results_response = client.get(f"/api/public/image/jobs/{job['id']}/results")
    assert results_response.status_code == 200
    assert results_response.json()["data"] == []


def test_auto_title_does_not_block_image_job_creation(monkeypatch):
    captured_payloads: list[dict[str, object]] = []

    def fake_post(url: str, *, headers, json, timeout: float):
        captured_payloads.append(json)
        payload = {"choices": [{"message": {"content": '{"title":"雨夜少女"}'}}]}
        return FakeHttpResponse(status_code=200, payload=payload, headers={})

    monkeypatch.setenv("OPENAI_PROVIDER_KEY", "sk-test")
    monkeypatch.setenv("OPENAI_CHAT_MODEL_CODE", "title-model")
    monkeypatch.setenv("OPENAI_CHAT_MODEL_PROVIDER_MODEL", "title-provider-model")
    monkeypatch.setenv("IMAGE_JOB_TITLE_MODEL_CODE", "title-model")
    monkeypatch.setattr("apps.api.app.domains.llm.openai_chat.httpx.post", fake_post)
    client = build_client()

    job = create_auto_titled_image_job(client, prompt="画一个雨夜街头的少女，电影感光影")

    assert job["status"] == "queued"
    assert job["title"] is None
    assert captured_payloads == []


def test_anonymous_image_job_uses_server_provider_when_enabled():
    client = build_client()

    response = client.post(
        "/api/public/image/jobs",
        json={"prompt": "Anonymous render", "model_code": "gpt-image-2", "requested_count": 1},
    )

    assert response.status_code == 201
    job = response.json()["data"]
    assert job["source"] == "anonymous"
    assert "charge_cents" not in job
    with session_scope() as session:
        stored_job = session.get(ImageJob, job["id"])
        assert stored_job.user_id is None
        assert stored_job.client_access_id is None
        assert stored_job.client_provider_config is None


def test_create_image_job_does_not_wait_for_renderer(monkeypatch):
    def failing_renderer(_session=None, **_kwargs):
        raise RuntimeError("upstream timeout")

    monkeypatch.setattr(image_service, "render_image", failing_renderer)
    client = build_client()
    register_user(client, email="direct-failure@example.com")

    response = client.post(
        "/api/public/image/jobs",
        json={"prompt": "Direct failure", "model_code": "gpt-image-2", "requested_count": 1},
    )

    assert response.status_code == 201
    job = response.json()["data"]
    assert job["status"] == "queued"
    assert job["started_at"] is None
    assert job["finished_at"] is None
    with session_scope() as session:
        stored_job = session.execute(select(ImageJob)).scalar_one()
        assert stored_job.status == "queued"
        assert stored_job.attempt_count == 0
        assert stored_job.error_code is None
        assert stored_job.error_message is None


def test_local_dev_image_job_runs_without_openai_key(monkeypatch):
    monkeypatch.delenv("OPENAI_PROVIDER_KEY", raising=False)
    client = build_client()

    create_response = client.post(
        "/api/public/image/jobs",
        json={
            "prompt": "Local development render",
            "model_code": "local-dev-image",
            "requested_count": 1,
        },
    )
    assert create_response.status_code == 201
    created_job = create_response.json()["data"]
    assert created_job["status"] == "queued"
    job_id = created_job["id"]

    run_image_worker_for(job_id)

    job_response = client.get(f"/api/public/image/jobs/{job_id}")
    results_response = client.get(f"/api/public/image/jobs/{job_id}/results")

    assert job_response.json()["data"]["status"] == "succeeded"
    assert results_response.json()["data"][0]["provider_request_id"].startswith("local-dev:")
    asset_response = client.get(results_response.json()["data"][0]["asset_url"])
    assert asset_response.status_code == 200
    assert "local-dev-image" in asset_response.text


def test_client_provider_image_job_records_browser_context():
    client = build_client()

    response = client.post(
        "/api/public/image/jobs",
        headers=client_provider_headers(),
        json={"prompt": "Client paid render", "model_code": "gpt-image-2", "requested_count": 1},
    )

    assert response.status_code == 201
    job = response.json()["data"]
    assert job["source"] == "client_provider"
    assert "charge_cents" not in job
    with session_scope() as session:
        stored_job = session.get(ImageJob, job["id"])
        assert stored_job.client_access_id == "browser-client-1"
        assert stored_job.client_provider_config["base_url"] == "https://client.example/v1"
        assert stored_job.client_provider_config["api_key"] == "sk-client-provider"


def test_client_provider_worker_uses_submitted_provider(monkeypatch):
    client = build_client()
    captured: dict[str, object] = {}

    def fake_post(url: str, *, headers, json, timeout: float):
        captured["url"] = url
        captured["headers"] = headers
        captured["json"] = json
        captured["timeout"] = timeout
        payload = {"choices": [{"message": {"content": "![result](https://cdn.example.test/client.png)"}}]}
        return FakeHttpResponse(status_code=200, payload=payload, headers={"x-request-id": "req-client"})

    def fake_get(url: str, *, timeout: float):
        captured["download_url"] = url
        captured["download_timeout"] = timeout
        return FakeHttpResponse(status_code=200, payload={}, headers={"content-type": "image/png"}, content=VALID_PNG_BYTES)

    monkeypatch.setattr("apps.api.app.domains.llm.openai_chat_image.httpx.post", fake_post)
    monkeypatch.setattr("apps.api.app.domains.llm.openai_chat_image.httpx.get", fake_get)
    response = client.post(
        "/api/public/image/jobs",
        headers=client_provider_headers(),
        json={"prompt": "Client key render", "model_code": "gpt-image-2", "requested_count": 1},
    )

    created_job = response.json()["data"]
    assert created_job["status"] == "queued"
    job_id = created_job["id"]
    run_image_worker_for(job_id)
    results_response = client.get(f"/api/public/image/jobs/{job_id}/results")

    assert captured["url"] == "https://client.example/v1/chat/completions"
    assert captured["headers"] == {"Authorization": "Bearer sk-client-provider", "Content-Type": "application/json"}
    assert captured["json"]["model"] == "gpt-image-2"
    assert results_response.json()["data"][0]["provider_request_id"] == "req-client"


def test_client_provider_worker_resolves_key_only_request_from_url_pool(monkeypatch):
    client = build_client()
    seed_admin()
    admin_login(client)
    client.patch(
        "/api/admin/settings",
        json={
            "site_title": "image Studio",
            "allow_public_signup": True,
            "allow_anonymous_image": True,
            "uploads_enabled": True,
            "client_provider_url_pool": "https://bad.example/v1\nhttps://good.example/v1",
        },
    )
    attempts: list[tuple[str, dict[str, str], float]] = []
    captured: dict[str, object] = {}

    def fake_get(url: str, *, timeout: float, headers=None):
        if url.endswith("/models"):
            attempts.append((url, dict(headers), timeout))
            if url == "https://bad.example/v1/models":
                return FakeHttpResponse(
                    status_code=401,
                    payload={"error": {"message": "invalid api key for this site"}},
                    headers={},
                )
            return FakeHttpResponse(status_code=200, payload={"data": []}, headers={})
        return FakeHttpResponse(status_code=200, payload={}, headers={"content-type": "image/png"}, content=VALID_PNG_BYTES)

    def fake_post(url: str, *, headers, json, timeout):
        captured["url"] = url
        captured["headers"] = headers
        payload = {"choices": [{"message": {"content": "![result](https://cdn.example.test/client.png)"}}]}
        return FakeHttpResponse(status_code=200, payload=payload, headers={"x-request-id": "req-client"})

    monkeypatch.setattr("apps.api.app.domains.llm.client_provider_pool.httpx.get", fake_get)
    monkeypatch.setattr("apps.api.app.domains.llm.openai_chat_image.httpx.post", fake_post)
    monkeypatch.setattr("apps.api.app.domains.llm.openai_chat_image.httpx.get", fake_get)

    response = client.post(
        "/api/public/image/jobs",
        headers=client_provider_key_only_headers(),
        json={"prompt": "Client key render", "model_code": "gpt-image-2", "requested_count": 1},
    )
    assert response.status_code == 201
    created_job = response.json()["data"]
    assert created_job["status"] == "queued"
    assert attempts == []
    job_id = created_job["id"]

    run_image_worker_for(job_id)

    job_response = client.get(f"/api/public/image/jobs/{job_id}")

    assert [item[0] for item in attempts] == [
        "https://bad.example/v1/models",
        "https://good.example/v1/models",
    ]
    assert attempts[0][1]["Authorization"] == "Bearer sk-client-provider"
    assert attempts[0][2] == 10.0
    assert captured["url"] == "https://good.example/v1/chat/completions"
    assert job_response.json()["data"]["client_provider_base_url"] == "https://good.example/v1"


def test_gpt_image_two_job_ignores_configured_local_price(monkeypatch):
    monkeypatch.setenv("OPENAI_PROVIDER_NAME", "wdapi")
    monkeypatch.setenv("OPENAI_PROVIDER_BASE_URL", "https://ws.wdapi.top/v1")
    monkeypatch.setenv("OPENAI_PROVIDER_API_KEY_ENV", "OPENAI_PROVIDER_KEY")
    monkeypatch.setenv("OPENAI_PROVIDER_DEFAULT_MODEL", "gemini-3-flash-preview-low-search")
    monkeypatch.setenv("OPENAI_CHAT_MODEL_CODE", "gemini-3-flash-preview-low-search")
    monkeypatch.setenv("OPENAI_CHAT_MODEL_DISPLAY_NAME", "Gemini 3 Flash Preview Low Search")
    monkeypatch.setenv("OPENAI_CHAT_MODEL_PROVIDER_MODEL", "gemini-3-flash-preview-low-search")
    monkeypatch.setenv("OPENAI_IMAGE_MODEL_CODE", "gpt-image-2")
    monkeypatch.setenv("OPENAI_IMAGE_MODEL_DISPLAY_NAME", "GPT Image 2")
    monkeypatch.setenv("OPENAI_IMAGE_MODEL_PROVIDER_MODEL", "gpt-image-2")

    client = build_client()
    register_user(client, email="priced-gpt-image@example.com")

    create_response = client.post(
        "/api/public/image/jobs",
        json={"prompt": "Priced GPT image", "model_code": "gpt-image-2", "requested_count": 1},
    )

    assert create_response.status_code == 201
    job = create_response.json()["data"]
    assert job["status"] == "queued"
    assert "charge_cents" not in job


def test_official_channel_size_quality_does_not_create_local_charge() -> None:
    client = build_client()
    register_user(client, email="official-priced@example.com")

    create_response = client.post(
        "/api/public/image/jobs",
        json={
            "prompt": "Official priced image",
            "model_code": "gpt-image-2-official",
            "requested_count": 1,
            "size": "1024x1024",
            "quality": "medium",
        },
    )

    assert create_response.status_code == 201
    job = create_response.json()["data"]
    assert job["status"] == "queued"
    assert "charge_cents" not in job
    assert job["provider_model"] == "gpt-image-2"


def test_reference_and_edit_size_quality_does_not_add_local_charge() -> None:
    client = build_client()
    register_user(client, email="priced-edit@example.com")
    upload_response = client.post(
        "/api/public/image/uploads",
        files={"file": ("source.png", b"source-image", "image/png")},
    )

    create_response = client.post(
        "/api/public/image/jobs",
        json={
            "prompt": "turn it into a product photo",
            "model_code": "gpt-image-2",
            "requested_count": 1,
            "mode": "edit",
            "source_asset_id": upload_response.json()["data"]["id"],
            "size": "1024x1024",
            "quality": "medium",
        },
    )

    assert create_response.status_code == 201
    job = create_response.json()["data"]
    assert job["status"] == "queued"
    assert "charge_cents" not in job


def test_edit_job_records_uploaded_source_asset_and_passes_it_to_renderer(monkeypatch):
    client = build_client()
    register_user(client, email="edit-source@example.com")
    upload_response = client.post(
        "/api/public/image/uploads",
        files={"file": ("source.png", b"source-image", "image/png")},
    )
    assert upload_response.status_code == 201
    source_asset_id = upload_response.json()["data"]["id"]
    captured: dict[str, object] = {}

    def renderer(_session=None, **kwargs):
        captured.update(kwargs)
        return build_rendered_image(prompt=kwargs["prompt"], model_code=kwargs["model_code"])

    monkeypatch.setattr(image_service, "render_image", renderer, raising=False)
    create_response = client.post(
        "/api/public/image/jobs",
        json={
            "prompt": "turn it into a watercolor dog",
            "model_code": "gpt-image-2",
            "requested_count": 1,
            "mode": "edit",
            "source_asset_id": source_asset_id,
        },
    )
    assert create_response.status_code == 201
    job = create_response.json()["data"]
    assert job["mode"] == "edit"
    assert job["source_asset_id"] == source_asset_id

    run_image_worker_for(job["id"])
    assert captured["source_asset_id"] == source_asset_id


def test_create_job_stores_reference_assets_in_order():
    build_client()
    with session_scope() as session:
        owner = create_anonymous_owner(session)
        first_asset = create_asset(session, owner_user_id=None, owner_anonymous_session_id=owner.anonymous_session_id, storage_path="references/ref-a.png")
        second_asset = create_asset(session, owner_user_id=None, owner_anonymous_session_id=owner.anonymous_session_id, storage_path="references/ref-b.png")
        job = image_service.create_job(
            session,
            owner=owner,
            source="anonymous",
            prompt="Use references",
            model_code="gpt-image-2",
            requested_count=1,
            mode="generate",
            reference_asset_ids=[first_asset.id, second_asset.id],
        )
        rows = list_reference_rows(session, job_id=job.id)

    assert [row.sequence for row in rows] == [1, 2]
    assert [row.asset_id for row in rows] == [first_asset.id, second_asset.id]


def test_create_job_rejects_missing_reference_asset():
    build_client()
    with session_scope() as session:
        owner = create_anonymous_owner(session)
        with pytest.raises(AppError) as error:
            image_service.create_job(
                session,
                owner=owner,
                source="anonymous",
                prompt="Missing reference",
                model_code="gpt-image-2",
                requested_count=1,
                mode="generate",
                reference_asset_ids=[999999],
            )

    assert error.value.code == "reference_asset_not_found"


def test_create_job_rejects_forbidden_reference_asset():
    build_client()
    with session_scope() as session:
        asset = create_asset(session, owner_user_id=321, storage_path="references/private-ref.png")
        with pytest.raises(AppError) as error:
            image_service.create_job(
                session,
                owner=OwnerContext(user_id=123, anonymous_session_id=None),
                source="member",
                prompt="Forbidden reference",
                model_code="gpt-image-2",
                requested_count=1,
                mode="generate",
                reference_asset_ids=[asset.id],
            )

    assert error.value.code == "reference_asset_forbidden"


def test_image_job_passes_reference_assets_to_renderer(monkeypatch):
    build_client()
    render_calls: list[dict] = []

    def renderer(_session=None, **kwargs):
        render_calls.append(dict(kwargs))
        return build_rendered_image(prompt=kwargs["prompt"], model_code=kwargs["model_code"])

    monkeypatch.setattr(image_service, "render_image", renderer, raising=False)
    with session_scope() as session:
        owner = create_anonymous_owner(session)
        first_asset = create_asset(session, owner_user_id=None, owner_anonymous_session_id=owner.anonymous_session_id, storage_path="references/ref-a.png")
        second_asset = create_asset(session, owner_user_id=None, owner_anonymous_session_id=owner.anonymous_session_id, storage_path="references/ref-b.png")
        job = image_service.create_job(
            session,
            owner=owner,
            source="anonymous",
            prompt="Render with references",
            model_code="gpt-image-2",
            requested_count=1,
            mode="generate",
            reference_asset_ids=[first_asset.id, second_asset.id],
        )
        job_id = job.id

    processed_job_id = worker_image_jobs.run_next_image_job()

    assert processed_job_id == job_id
    assert render_calls[0]["reference_asset_ids"] == [first_asset.id, second_asset.id]


def test_public_image_job_stores_conversation_messages():
    client = build_client()
    register_user(client, email="image-conversation@example.com")

    create_response = client.post(
        "/api/public/image/jobs",
        json={
            "prompt": "把它改成夜晚",
            "model_code": "gpt-image-2",
            "requested_count": 1,
            "conversation_messages": [
                {"role": "user", "content": "画一只白猫"},
                {"role": "assistant", "content": "Generated image: 白猫坐在窗边"},
                {"role": "user", "content": "把它改成夜晚"},
            ],
        },
    )

    assert create_response.status_code == 201
    job_id = create_response.json()["data"]["id"]
    with session_scope() as session:
        stored_job = session.get(ImageJob, job_id)
        assert stored_job.conversation_messages == [
            {"role": "user", "content": "画一只白猫"},
            {"role": "assistant", "content": "Generated image: 白猫坐在窗边"},
            {"role": "user", "content": "把它改成夜晚"},
        ]


def test_worker_claims_and_processes_queued_job(monkeypatch):
    monkeypatch.setattr(image_service, "render_image", build_rendered_image_from_job, raising=False)
    client = build_client()
    user = register_user(client)
    job = create_queued_job_for_user(user_id=user["id"], prompt="Fog over bronze towers")

    assert hasattr(worker_image_jobs, "run_next_image_job")

    processed_job_id = worker_image_jobs.run_next_image_job()

    assert processed_job_id == job.id

    job_response = client.get(f"/api/public/image/jobs/{job.id}")
    assert job_response.status_code == 200
    processed_job = job_response.json()["data"]
    assert processed_job["status"] == "succeeded"
    assert processed_job["attempt_count"] == 1

    results_response = client.get(f"/api/public/image/jobs/{job.id}/results")
    assert results_response.status_code == 200
    results = results_response.json()["data"]
    assert len(results) == 1

    asset_response = client.get(results[0]["asset_url"])
    assert asset_response.status_code == 200
    assert "svg" in asset_response.text


def test_worker_persists_rendered_assets_with_mime_extension(monkeypatch):
    def png_renderer(_session=None, **kwargs) -> RenderedImage:
        return RenderedImage(
            content=VALID_PNG_BYTES,
            mime_type="image/png",
            revised_prompt=str(kwargs["prompt"]),
            provider_request_id="test:png",
        )

    monkeypatch.setattr(image_service, "render_image", png_renderer, raising=False)
    client = build_client()
    register_user(client, email="png-extension@example.com")
    job = create_image_job(client, prompt="PNG output")
    run_image_worker_for(job["id"])

    with session_scope() as session:
        result = session.execute(select(ImageJobResult).where(ImageJobResult.job_id == job["id"])).scalar_one()
        asset = session.get(Asset, result.asset_id)

    assert asset is not None
    assert asset.storage_path == f"asset-{asset.id}.png"
    assert build_asset_storage().read_bytes(asset.storage_path) == VALID_PNG_BYTES


def test_user_can_delete_own_image_job_with_results(monkeypatch):
    monkeypatch.setattr(image_service, "render_image", build_rendered_image_from_job, raising=False)
    client = build_client()
    register_user(client)
    job = create_image_job(client, prompt="Delete completed job")
    run_image_worker_for(job["id"])

    response = client.delete(f"/api/public/image/jobs/{job['id']}")

    assert response.status_code == 200
    assert response.json()["data"] == {"deleted": True, "id": str(job["id"])}
    assert client.get(f"/api/public/image/jobs/{job['id']}").status_code == 404
    with session_scope() as session:
        assert session.get(ImageJob, job["id"]) is None
        assert list(session.execute(select(ImageJobResult)).scalars()) == []


def test_delete_image_job_removes_job_record():
    client = build_client()
    register_user(client, email="delete-queued@example.com")
    job = create_image_job(client, prompt="Delete image job")

    response = client.delete(f"/api/public/image/jobs/{job['id']}")

    assert response.status_code == 200
    with session_scope() as session:
        assert session.get(ImageJob, job["id"]) is None


def test_worker_retries_failed_job_before_terminal_failure(monkeypatch):
    client = build_client()
    user = register_user(client)
    job = create_queued_job_for_user(user_id=user["id"], prompt="Retry once image")
    attempts = {"count": 0}

    def flaky_renderer(
        _session=None,
        *,
        prompt: str,
        model_code: str,
        provider_id: int | None = None,
        provider_model: str | None = None,
        **_kwargs,
    ):
        del provider_id, provider_model
        attempts["count"] += 1
        if attempts["count"] == 1:
            raise RuntimeError("upstream timeout")
        return build_rendered_image(prompt=prompt, model_code=model_code)

    monkeypatch.setattr(image_service, "IMAGE_JOB_RETRY_DELAY_SECONDS", 0, raising=False)
    monkeypatch.setattr(image_service, "render_image", flaky_renderer, raising=False)
    assert hasattr(worker_image_jobs, "run_next_image_job")

    first_run_job_id = worker_image_jobs.run_next_image_job()
    assert first_run_job_id == job.id

    first_job_response = client.get(f"/api/public/image/jobs/{job.id}")
    assert first_job_response.status_code == 200
    first_job = first_job_response.json()["data"]
    assert first_job["status"] == "queued"
    assert first_job["attempt_count"] == 1
    assert first_job["error_code"] == "image_job_retry_scheduled"

    second_run_job_id = worker_image_jobs.run_next_image_job()
    assert second_run_job_id == job.id

    second_job_response = client.get(f"/api/public/image/jobs/{job.id}")
    assert second_job_response.status_code == 200
    second_job = second_job_response.json()["data"]
    assert second_job["status"] == "succeeded"
    assert second_job["attempt_count"] == 2


def test_worker_marks_job_failed_after_max_attempts_without_local_billing(monkeypatch):
    client = build_client()
    user = register_user(client)
    monkeypatch.setattr(image_service, "IMAGE_JOB_MAX_ATTEMPTS", 2, raising=False)
    monkeypatch.setattr(image_service, "IMAGE_JOB_RETRY_DELAY_SECONDS", 0, raising=False)

    def failing_renderer(
        _session=None,
        *,
        prompt: str,
        model_code: str,
        provider_id: int | None = None,
        provider_model: str | None = None,
        **_kwargs,
    ):
        del provider_id, provider_model
        raise RuntimeError(f"provider rejected: {prompt}:{model_code}")

    monkeypatch.setattr(image_service, "render_image", failing_renderer, raising=False)
    job = create_queued_job_for_user(user_id=user["id"], prompt="Always fail image")
    assert hasattr(worker_image_jobs, "run_next_image_job")

    first_run_job_id = worker_image_jobs.run_next_image_job()
    assert first_run_job_id == job.id

    first_job_response = client.get(f"/api/public/image/jobs/{job.id}")
    assert first_job_response.status_code == 200
    first_job = first_job_response.json()["data"]
    assert first_job["status"] == "queued"
    assert first_job["attempt_count"] == 1

    second_run_job_id = worker_image_jobs.run_next_image_job()
    assert second_run_job_id == job.id

    second_job_response = client.get(f"/api/public/image/jobs/{job.id}")
    assert second_job_response.status_code == 200
    second_job = second_job_response.json()["data"]
    assert second_job["status"] == "failed"
    assert second_job["attempt_count"] == 2
    assert second_job["error_code"] == "image_job_failed"
    assert "provider rejected" in second_job["error_message"]



def test_worker_recovers_stale_running_job(monkeypatch):
    client = build_client()
    user = register_user(client, email="stale@example.com")
    job = create_queued_job_for_user(user_id=user["id"], prompt="Recover stale job")
    with session_scope() as session:
        running_job = image_service.get_job(session, job.id)
        running_item = session.execute(select(ImageJobItem).where(ImageJobItem.job_id == job.id)).scalar_one()
        running_job.status = "running"
        running_job.attempt_count = 1
        running_job.started_at = datetime.utcnow() - timedelta(seconds=30)
        running_job.finished_at = None
        running_item.status = "running"
        running_item.attempt_count = 1
        running_item.started_at = running_job.started_at
        running_item.finished_at = None
        session.flush()

    monkeypatch.setattr(image_service, "IMAGE_JOB_STALE_TIMEOUT_SECONDS", 1, raising=False)
    monkeypatch.setattr(image_service, "render_image", build_rendered_image_from_job, raising=False)
    processed_job_id = worker_image_jobs.run_next_image_job()
    job_response = client.get(f"/api/public/image/jobs/{job.id}")

    assert processed_job_id == job.id
    assert job_response.status_code == 200
    assert job_response.json()["data"]["status"] == "succeeded"
    assert job_response.json()["data"]["attempt_count"] == 2


def test_admin_can_list_jobs():
    client = build_client()
    register_user(client)
    create_image_job(client, prompt="Admin visible queue")
    seed_admin()
    admin_login(client)

    response = client.get("/api/admin/image/jobs")

    assert response.status_code == 200
    assert len(response.json()["data"]) >= 1
