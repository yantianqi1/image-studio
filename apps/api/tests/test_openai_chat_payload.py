from __future__ import annotations

import pytest

from apps.api.app.core.errors import AppError
from apps.api.app.domains.comic.structured_outputs import StoryAnalysis
from apps.api.app.domains.llm import openai_chat
from apps.api.app.domains.llm.openai_chat import ChatTarget, build_chat_payload, parse_chat_response


class ChatResponse:
    status_code = 200

    def __init__(self, content: str) -> None:
        self.content = content

    def json(self) -> dict:
        return {"choices": [{"message": {"content": self.content}}]}


class ProviderResponse:
    def __init__(self, status_code: int, payload: dict) -> None:
        self.status_code = status_code
        self.payload = payload
        self.headers = {"x-request-id": "req-chat"}

    @property
    def text(self) -> str:
        return str(self.payload)

    def json(self) -> dict:
        return self.payload


def test_build_chat_payload_includes_schema_contract() -> None:
    payload = build_chat_payload(
        "chat-model",
        "system prompt",
        {"source_text": "story"},
        "StoryAnalysis",
        response_schema=StoryAnalysis.model_json_schema(),
    )

    user_content = payload["messages"][1]["content"]

    assert "title_suggestion" in user_content
    assert "narrative_beats" in user_content
    assert payload["metadata"]["schema_name"] == "StoryAnalysis"


def test_build_chat_payload_supports_multimodal_messages() -> None:
    payload = build_chat_payload(
        "chat-model",
        "system prompt",
        None,
        "StoryAnalysis",
        user_messages=[
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "请分析图片"},
                    {"type": "image_url", "image_url": {"url": "data:image/png;base64,AAAA"}},
                ],
            }
        ],
    )

    assert payload["messages"][0]["content"] == "system prompt"
    assert payload["messages"][1]["content"][0]["type"] == "text"
    assert payload["messages"][1]["content"][1]["type"] == "image_url"


def test_parse_chat_response_accepts_markdown_json_object() -> None:
    response = ChatResponse('```json\n{"title_suggestion":"镜中城"}\n```')

    parsed = parse_chat_response(response)

    assert parsed == {"title_suggestion": "镜中城"}


def test_parse_chat_response_accepts_json_object_with_text_wrapper() -> None:
    response = ChatResponse('好的，结果如下：\n{"genre":"fantasy"}\n请继续。')

    parsed = parse_chat_response(response)

    assert parsed == {"genre": "fantasy"}


def test_parse_chat_response_skips_non_json_bracket_labels() -> None:
    response = ChatResponse('[JSON]\n{"genre":"fantasy"}')

    parsed = parse_chat_response(response)

    assert parsed == {"genre": "fantasy"}


def test_parse_chat_response_accepts_single_object_array_wrapper() -> None:
    response = ChatResponse('[{"tone":"warm"}]')

    parsed = parse_chat_response(response)

    assert parsed == {"tone": "warm"}


def test_parse_chat_response_wraps_top_level_array_with_schema_array_field() -> None:
    response = ChatResponse('[{"character_code":"hero","name":"Lin"}]')
    schema = {"type": "object", "properties": {"characters": {"type": "array"}}, "required": ["characters"]}

    parsed = parse_chat_response(response, response_schema=schema)

    assert parsed == {"characters": [{"character_code": "hero", "name": "Lin"}]}


def test_parse_chat_response_accepts_json_string_wrapped_object() -> None:
    response = ChatResponse('"{\\"genre\\":\\"fantasy\\"}"')

    parsed = parse_chat_response(response)

    assert parsed == {"genre": "fantasy"}


def test_parse_chat_response_rejects_ambiguous_multiple_json_objects() -> None:
    response = ChatResponse('{"genre":"fantasy"}\n{"tone":"warm"}')

    with pytest.raises(AppError, match="multiple JSON values"):
        parse_chat_response(response)


def test_generate_structured_chat_retries_retryable_upstream_errors(monkeypatch) -> None:
    responses = [
        ProviderResponse(502, {"error": {"message": "bad gateway"}}),
        ProviderResponse(429, {"error": {"message": "rate limited"}}),
        ProviderResponse(200, {"choices": [{"message": {"content": '{"genre":"fantasy"}'}}]}),
    ]
    calls: list[dict] = []

    def fake_post(url: str, *, headers, json, timeout: float):
        calls.append({"url": url, "headers": headers, "json": json, "timeout": timeout})
        return responses.pop(0)

    monkeypatch.setattr(openai_chat, "OPENAI_CHAT_RETRY_DELAY_SECONDS", 0, raising=False)
    monkeypatch.setattr(openai_chat.httpx, "post", fake_post)
    target = ChatTarget(base_url="https://provider.example/v1", api_key="sk-test", provider_model="chat-model")

    payload = openai_chat.generate_structured_chat(
        None,
        system_prompt="system prompt",
        user_payload={"source_text": "story"},
        schema_name="StoryAnalysis",
        chat_target=target,
    )

    assert payload == {"genre": "fantasy"}
    assert len(calls) == 3
