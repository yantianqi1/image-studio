from __future__ import annotations

from dataclasses import dataclass

from fastapi.testclient import TestClient

from apps.api.app.domains.auth.anonymous_sessions import create_anonymous_session
from apps.api.app.domains.auth.ownership import OwnerContext
from apps.api.app.domains.image.models import Asset
from apps.api.app.domains.image.service import create_job
from apps.api.app.infra.db.session import initialize_database, session_scope
from apps.api.app.main import create_app
from apps.worker.worker.tasks import image_jobs as worker_image_jobs
from apps.api.tests.test_provider_catalog import admin_login, register_user, seed_admin, write_reference_file


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


@dataclass
class PlainTextHttpResponse:
    status_code: int
    text: str
    headers: dict[str, str]

    def json(self) -> dict[str, object]:
        raise ValueError("plain text response")


def test_chat_compatible_image_job_uses_chat_completions(monkeypatch) -> None:
    client = build_client()
    provider = create_chat_image_provider(client)
    create_chat_image_model(client, provider_id=provider["id"])
    register_user(client, email="chat-image@example.com")
    captured: dict[str, object] = {}

    def fake_post(url: str, *, headers, json, timeout: float):
        captured["url"] = url
        captured["headers"] = headers
        captured["json"] = json
        captured["timeout"] = timeout
        payload = {"choices": [{"message": {"content": "![result](https://cdn.example.test/image.png)"}}]}
        return FakeHttpResponse(status_code=200, payload=payload, headers={"x-request-id": "req-chat-img-1"})

    def fake_get(url: str, *, timeout: float):
        captured["download_url"] = url
        captured["download_timeout"] = timeout
        return FakeHttpResponse(status_code=200, payload={}, headers={"content-type": "image/png"}, content=b"chat-png")

    monkeypatch.setenv("OPENAI_PROVIDER_KEY", "sk-test")
    monkeypatch.setattr("apps.api.app.domains.llm.openai_chat_image.httpx.post", fake_post)
    monkeypatch.setattr("apps.api.app.domains.llm.openai_chat_image.httpx.get", fake_get)
    response = client.post(
        "/api/public/image/jobs",
        json={"prompt": "二次元海报", "model_code": "chat-image", "requested_count": 1},
    )

    job_id = response.json()["data"]["id"]
    processed_job_id = worker_image_jobs.run_next_image_job()
    results_response = client.get(f"/api/public/image/jobs/{job_id}/results")

    assert processed_job_id == job_id
    assert captured["url"] == "https://example.test/v1/chat/completions"
    assert captured["headers"] == {"Authorization": "Bearer sk-test", "Content-Type": "application/json"}
    assert captured["json"]["model"] == "gpt-image-2"
    assert captured["json"]["stream"] is True
    assert captured["json"]["messages"][0] == {"role": "system", "content": "[Start a new Chat]"}
    assert captured["json"]["messages"][1] == {"role": "user", "content": "二次元海报"}
    assert captured["timeout"] == 180.0
    assert captured["download_timeout"] == 60.0
    assert captured["download_url"] == "https://cdn.example.test/image.png"
    assert results_response.json()["data"][0]["provider_request_id"] == "req-chat-img-1"


def test_chat_compatible_image_job_sends_reference_assets(monkeypatch) -> None:
    client = build_client()
    provider = create_chat_image_provider(client)
    create_chat_image_model(client, provider_id=provider["id"])
    captured: dict[str, object] = {}

    with session_scope() as session:
        owner = create_anonymous_owner(session)
        asset = Asset(
            owner_user_id=None,
            owner_anonymous_session_id=owner.anonymous_session_id,
            storage_path="/tmp/ref-chat.png",
            mime_type="image/png",
        )
        session.add(asset)
        session.flush()
        asset.storage_path = write_reference_file("ref-chat.png", b"reference-bytes")
        job = create_job(
            session,
            owner=owner,
            source="anonymous",
            prompt="保持角色一致",
            model_code="chat-image",
            requested_count=1,
            mode="generate",
            reference_asset_ids=[asset.id],
        )
        job_id = job.id

    def fake_post(url: str, *, headers, json, timeout: float):
        del url, headers, timeout
        captured["content"] = json["messages"][1]["content"]
        payload = {"choices": [{"message": {"content": "![result](https://cdn.example.test/ref-result.png)"}}]}
        return FakeHttpResponse(status_code=200, payload=payload, headers={})

    def fake_get(url: str, *, timeout: float):
        del url, timeout
        return FakeHttpResponse(status_code=200, payload={}, headers={"content-type": "image/png"}, content=b"chat-ref-png")

    monkeypatch.setenv("OPENAI_PROVIDER_KEY", "sk-test")
    monkeypatch.setattr("apps.api.app.domains.llm.openai_chat_image.httpx.post", fake_post)
    monkeypatch.setattr("apps.api.app.domains.llm.openai_chat_image.httpx.get", fake_get)
    processed_job_id = worker_image_jobs.run_next_image_job()

    assert processed_job_id == job_id
    assert captured["content"][0] == {"type": "text", "text": "保持角色一致"}
    assert captured["content"][1]["type"] == "image_url"
    assert captured["content"][1]["image_url"]["url"].startswith("data:image/png;base64,")


def test_chat_compatible_image_parser_accepts_plain_markdown_response(monkeypatch) -> None:
    from apps.api.app.domains.llm.models import Provider
    from apps.api.app.domains.llm.openai_chat_image import parse_chat_image_response

    def fake_get(url: str, *, timeout: float):
        assert url == "https://image2.mom/generated-images/plain-markdown.png"
        return FakeHttpResponse(status_code=200, payload={}, headers={"content-type": "image/png"}, content=b"plain-png")

    monkeypatch.setattr("apps.api.app.domains.llm.openai_chat_image.httpx.get", fake_get)
    response = PlainTextHttpResponse(
        status_code=200,
        text="![image_1](https://image2.mom/generated-images/plain-markdown.png)",
        headers={"content-type": "text/plain"},
    )
    rendered = parse_chat_image_response(
        response=response,
        provider=Provider(name="wdapi", type="openai-chat-compatible", base_url="https://example.test/v1"),
        prompt="测试",
    )

    assert rendered.content == b"plain-png"
    assert rendered.mime_type == "image/png"


def build_client() -> TestClient:
    initialize_database()
    client = TestClient(create_app())
    seed_admin()
    admin_login(client)
    return client


def create_anonymous_owner(session) -> OwnerContext:
    anonymous_session, _token = create_anonymous_session(session)
    return OwnerContext(user_id=None, anonymous_session_id=anonymous_session.id)


def create_chat_image_provider(client: TestClient) -> dict[str, object]:
    response = client.post(
        "/api/admin/providers",
        json={
            "name": "chat-image-main",
            "type": "openai-chat-compatible",
            "base_url": "https://example.test/v1",
            "api_key_env": "OPENAI_PROVIDER_KEY",
            "default_model": "gpt-image-2",
        },
    )
    assert response.status_code == 201
    return response.json()["data"]


def create_chat_image_model(client: TestClient, *, provider_id: int) -> dict[str, object]:
    response = client.post(
        "/api/admin/models",
        json={
            "code": "chat-image",
            "display_name": "Chat Image",
            "capability": "image",
            "public_enabled": True,
            "member_price_cents": 55,
            "anonymous_price_cents": 99,
            "provider_id": provider_id,
            "provider_model": "gpt-image-2",
        },
    )
    assert response.status_code == 201
    return response.json()["data"]


def test_chat_compatible_stream_parser_ignores_empty_choice_chunks() -> None:
    from apps.api.app.domains.llm.openai_chat_image import parse_streaming_content

    content = parse_streaming_content(
        'data: {"choices": []}\n'
        'data: {"choices": [{"delta": {"content": "![result]("}}]}\n'
        'data: {"choices": [{"delta": {"content": "https://cdn.example.test/a.png)"}}]}\n'
        'data: [DONE]\n'
    )

    assert content == "![result](https://cdn.example.test/a.png)"
