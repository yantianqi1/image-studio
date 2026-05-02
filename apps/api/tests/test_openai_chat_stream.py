import httpx
import pytest

from apps.api.app.core.errors import AppError
from apps.api.app.domains.llm.openai_chat import ChatTarget
from apps.api.app.domains.llm.openai_chat_stream import (
    build_streaming_chat_payload,
    open_streaming_chat_response,
    parse_streaming_chat_data,
)


def test_build_streaming_chat_payload_adds_system_and_messages() -> None:
    payload = build_streaming_chat_payload(
        provider_model="chat-model",
        system_prompt="system",
        messages=[{"role": "user", "content": "写提示词"}],
    )

    assert payload["model"] == "chat-model"
    assert payload["stream"] is True
    assert payload["messages"] == [
        {"role": "system", "content": "system"},
        {"role": "user", "content": "写提示词"},
    ]


def test_parse_streaming_chat_data_reads_delta_content() -> None:
    data = '{"choices":[{"delta":{"content":"最终提示词"}}]}'

    assert parse_streaming_chat_data(data) == "最终提示词"


def test_parse_streaming_chat_data_ignores_done_marker() -> None:
    assert parse_streaming_chat_data("[DONE]") == ""


def test_open_streaming_chat_response_reads_streaming_error_body(monkeypatch) -> None:
    class FakeClient:
        def __init__(self, timeout: float) -> None:
            self.timeout = timeout

        def build_request(self, method: str, url: str, *, headers: dict, json: dict) -> httpx.Request:
            return httpx.Request(method, url, headers=headers, json=json)

        def send(self, request: httpx.Request, *, stream: bool) -> httpx.Response:
            del stream
            body = b'{"error":{"message":"bad key"}}'
            return httpx.Response(401, stream=httpx.ByteStream(body), request=request)

        def close(self) -> None:
            return None

    monkeypatch.setattr("apps.api.app.domains.llm.openai_chat_stream.httpx.Client", FakeClient)

    with pytest.raises(AppError) as exc_info:
        open_streaming_chat_response(
            target=ChatTarget(base_url="https://example.test/v1", api_key="sk-test", provider_model="model"),
            payload={"model": "model"},
        )

    assert exc_info.value.code == "provider_request_failed"
    assert exc_info.value.message == "bad key"
