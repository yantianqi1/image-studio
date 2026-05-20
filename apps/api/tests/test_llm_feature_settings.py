from __future__ import annotations

from collections.abc import Iterator

from fastapi.testclient import TestClient

from apps.api.app.domains.auth.service import create_admin_account
from apps.api.app.domains.llm.feature_settings import (
    FEATURE_PROMPT_CRAFTER_REVERSE_IMAGE,
    FEATURE_PROMPT_CRAFTER_TEXT,
)
from apps.api.app.domains.prompt_crafter import service as prompt_crafter_service
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


def create_provider(client: TestClient) -> dict[str, object]:
    response = client.post(
        "/api/admin/providers",
        json={
            "name": "facility-provider",
            "type": "openai-chat-compatible",
            "base_url": "https://facility.example/v1",
            "api_key_env": "OPENAI_PROVIDER_KEY",
            "default_model": "facility-default",
        },
    )
    assert response.status_code == 201
    return response.json()["data"]


def create_model(client: TestClient, *, provider_id: int, capability: str, code: str) -> dict[str, object]:
    response = client.post(
        "/api/admin/models",
        json={
            "code": code,
            "display_name": f"Facility {code}",
            "capability": capability,
            "provider_id": provider_id,
            "provider_model": f"upstream-{code}",
            "public_enabled": False,
        },
    )
    assert response.status_code == 201
    return response.json()["data"]


def update_feature(client: TestClient, *, feature_key: str, model_code: str):
    return client.patch(
        "/api/admin/llm/features",
        json={"features": [{"feature_key": feature_key, "model_code": model_code}]},
    )


def test_admin_llm_facilities_list_features_and_imported_models() -> None:
    client = build_client()
    seed_admin()
    admin_login(client)
    provider = create_provider(client)
    create_model(client, provider_id=int(provider["id"]), capability="chat", code="facility-chat")

    response = client.get("/api/admin/llm/features")

    assert response.status_code == 200
    data = response.json()["data"]
    feature_by_key = {feature["feature_key"]: feature for feature in data["features"]}
    model_codes = {model["code"] for model in data["models"]}
    assert FEATURE_PROMPT_CRAFTER_TEXT in feature_by_key
    assert feature_by_key[FEATURE_PROMPT_CRAFTER_REVERSE_IMAGE]["input_mode"] == "multimodal"
    assert feature_by_key[FEATURE_PROMPT_CRAFTER_TEXT]["model_code"] == "gemini-3-flash-preview-low"
    assert "facility-chat" in model_codes


def test_admin_can_update_prompt_crafter_model_and_runtime_uses_it(monkeypatch) -> None:
    client = build_client()
    seed_admin()
    admin_login(client)
    provider = create_provider(client)
    create_model(client, provider_id=int(provider["id"]), capability="chat", code="facility-chat")
    captured: dict[str, object] = {}

    def fake_stream_chat_completion(*, target, payload) -> Iterator[str]:
        captured["target_model"] = target.provider_model
        captured["payload"] = payload
        yield "ok"

    monkeypatch.setenv("OPENAI_PROVIDER_KEY", "sk-test")
    monkeypatch.setattr(prompt_crafter_service.openai_chat_stream, "stream_chat_completion", fake_stream_chat_completion)

    update_response = update_feature(client, feature_key=FEATURE_PROMPT_CRAFTER_TEXT, model_code="facility-chat")
    stream_response = client.post(
        "/api/public/prompt-crafter/chat/stream",
        json={"messages": [{"role": "user", "content": "咖啡包装"}]},
    )

    assert update_response.status_code == 200
    assert stream_response.status_code == 200
    assert captured["target_model"] == "upstream-facility-chat"
    assert captured["payload"]["model"] == "upstream-facility-chat"


def test_prompt_crafter_ignores_client_provider_headers(monkeypatch) -> None:
    client = build_client()
    seed_admin()
    admin_login(client)
    provider = create_provider(client)
    create_model(client, provider_id=int(provider["id"]), capability="chat", code="facility-chat")
    captured: dict[str, object] = {}

    def fake_stream_chat_completion(*, target, payload) -> Iterator[str]:
        captured["target_base_url"] = target.base_url
        captured["target_api_key"] = target.api_key
        captured["payload"] = payload
        yield "ok"

    monkeypatch.setenv("OPENAI_PROVIDER_KEY", "sk-test")
    monkeypatch.setattr(prompt_crafter_service.openai_chat_stream, "stream_chat_completion", fake_stream_chat_completion)

    stream_response = client.post(
        "/api/public/prompt-crafter/chat/stream",
        headers={
            "x-client-id": "browser-1",
            "x-client-provider-base-url": "https://client.example/v1",
            "x-client-provider-api-key": "sk-client",
        },
        json={"messages": [{"role": "user", "content": "咖啡包装"}]},
    )

    assert stream_response.status_code == 200
    assert captured["target_base_url"] != "https://client.example/v1"
    assert captured["target_api_key"] != "sk-client"


def test_admin_rejects_feature_model_with_wrong_capability() -> None:
    client = build_client()
    seed_admin()
    admin_login(client)
    provider = create_provider(client)
    create_model(client, provider_id=int(provider["id"]), capability="image", code="facility-image")

    response = update_feature(client, feature_key=FEATURE_PROMPT_CRAFTER_TEXT, model_code="facility-image")

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "llm_feature_model_invalid"
