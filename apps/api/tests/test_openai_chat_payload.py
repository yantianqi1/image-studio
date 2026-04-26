from __future__ import annotations

from apps.api.app.domains.comic.structured_outputs import StoryAnalysis
from apps.api.app.domains.llm.openai_chat import build_chat_payload


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
