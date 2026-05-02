from collections.abc import Iterator
import json

import httpx

from apps.api.app.core.errors import AppError
from apps.api.app.domains.prompt_crafter import service as prompt_crafter_service


def test_prompt_crafter_system_prompt_loads_skill_and_patterns() -> None:
    prompt = prompt_crafter_service.build_prompt_crafter_system_prompt()

    assert "GPT Image Prompt Crafter" in prompt
    assert "Default Output" in prompt
    assert "Prompt Patterns" in prompt
    assert "Human-Subject Photography" in prompt


def test_prompt_crafter_stream_returns_text_chunks(client, monkeypatch) -> None:
    captured: dict[str, object] = {}

    def fake_stream_chat_completion(*, target, payload) -> Iterator[str]:
        captured["target"] = target
        captured["payload"] = payload
        yield "最终提示词："
        yield "\n生成一张咖啡包装海报。"

    monkeypatch.setenv("OPENAI_PROVIDER_KEY", "sk-test")
    monkeypatch.setattr(
        prompt_crafter_service.openai_chat_stream,
        "stream_chat_completion",
        fake_stream_chat_completion,
    )

    response = client.post(
        "/api/public/prompt-crafter/chat/stream",
        json={"messages": [{"role": "user", "content": "咖啡包装海报"}]},
    )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    assert "event: start" in response.text
    assert_sse_event(response.text, "chunk", {"content": "最终提示词："})
    assert_sse_event(response.text, "chunk", {"content": "\n生成一张咖啡包装海报。"})
    assert_sse_event(response.text, "done", {})
    payload = captured["payload"]
    assert payload["stream"] is True
    assert payload["messages"][0]["role"] == "system"
    assert "gpt-image-2-prompt-crafter" in payload["messages"][0]["content"]
    assert payload["messages"][1] == {"role": "user", "content": "咖啡包装海报"}


def test_prompt_crafter_provider_errors_surface_as_api_errors(client, monkeypatch) -> None:
    def raise_provider_error(*, target, payload) -> Iterator[str]:
        del target, payload
        raise AppError(code="provider_request_failed", message="provider down", status_code=502)
        yield ""

    monkeypatch.setenv("OPENAI_PROVIDER_KEY", "sk-test")
    monkeypatch.setattr(
        prompt_crafter_service.openai_chat_stream,
        "stream_chat_completion",
        raise_provider_error,
    )

    response = client.post(
        "/api/public/prompt-crafter/chat/stream",
        json={"messages": [{"role": "user", "content": "产品海报"}]},
    )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    assert_sse_event(response.text, "error", {"code": "provider_request_failed", "message": "provider down"})


def test_prompt_crafter_raw_http_errors_surface_as_sse_errors(client, monkeypatch) -> None:
    def raise_http_error(*, target, payload) -> Iterator[str]:
        del target, payload
        raise httpx.ConnectError("provider blocked")
        yield ""

    monkeypatch.setenv("OPENAI_PROVIDER_KEY", "sk-test")
    monkeypatch.setattr(
        prompt_crafter_service.openai_chat_stream,
        "stream_chat_completion",
        raise_http_error,
    )

    response = client.post(
        "/api/public/prompt-crafter/chat/stream",
        json={"messages": [{"role": "user", "content": "产品海报"}]},
    )

    assert response.status_code == 200
    assert_sse_event(response.text, "error", {"code": "provider_request_failed", "message": "provider blocked"})


def test_prompt_crafter_raw_os_errors_surface_as_sse_errors(client, monkeypatch) -> None:
    def raise_os_error(*, target, payload) -> Iterator[str]:
        del target, payload
        raise OSError("provider blocked by sandbox")
        yield ""

    monkeypatch.setenv("OPENAI_PROVIDER_KEY", "sk-test")
    monkeypatch.setattr(
        prompt_crafter_service.openai_chat_stream,
        "stream_chat_completion",
        raise_os_error,
    )

    response = client.post(
        "/api/public/prompt-crafter/chat/stream",
        json={"messages": [{"role": "user", "content": "产品海报"}]},
    )

    assert response.status_code == 200
    assert_sse_event(
        response.text,
        "error",
        {"code": "provider_request_failed", "message": "provider blocked by sandbox"},
    )


def assert_sse_event(stream: str, event: str, payload: dict[str, str]) -> None:
    encoded = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    assert f"event: {event}\ndata: {encoded}\n\n" in stream
