from apps.api.app.domains.llm.openai_chat_stream import (
    build_streaming_chat_payload,
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
