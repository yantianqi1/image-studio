from __future__ import annotations

import pytest

from apps.api.app.core.errors import AppError
from apps.api.app.domains.comic.structured_outputs import StoryAnalysis
from apps.api.app.domains.llm.openai_chat import build_chat_payload, parse_chat_response


class ChatResponse:
    status_code = 200

    def __init__(self, content: str) -> None:
        self.content = content

    def json(self) -> dict:
        return {"choices": [{"message": {"content": self.content}}]}


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
