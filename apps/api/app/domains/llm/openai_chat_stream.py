from __future__ import annotations

from collections.abc import Iterator
from dataclasses import dataclass
import json

import httpx

from apps.api.app.core.errors import AppError
from apps.api.app.domains.llm.openai_chat import (
    ChatTarget,
    OPENAI_CHAT_TIMEOUT_SECONDS,
    build_provider_url,
    build_target_auth_headers,
    extract_provider_error,
)

OPENAI_CHAT_STREAM_PREFIX = "data:"
OPENAI_CHAT_STREAM_DONE = "[DONE]"


@dataclass(frozen=True)
class StreamingChatResponse:
    client: httpx.Client
    response: httpx.Response


def build_streaming_chat_payload(
    *,
    provider_model: str,
    system_prompt: str,
    messages: list[dict[str, str]],
) -> dict[str, object]:
    return {
        "model": provider_model,
        "messages": [{"role": "system", "content": system_prompt}, *messages],
        "stream": True,
    }


def stream_chat_completion(*, target: ChatTarget, payload: dict[str, object]) -> Iterator[str]:
    stream = open_streaming_chat_response(target=target, payload=payload)
    return iterate_streaming_chat_response(stream)


def open_streaming_chat_response(*, target: ChatTarget, payload: dict[str, object]) -> StreamingChatResponse:
    client = httpx.Client(timeout=OPENAI_CHAT_TIMEOUT_SECONDS)
    request = client.build_request(
        "POST",
        build_provider_url(target.base_url),
        headers=build_target_auth_headers(target),
        json=payload,
    )
    try:
        response = client.send(request, stream=True)
    except httpx.RequestError as exc:
        client.close()
        raise AppError(code="provider_request_failed", message=str(exc), status_code=502) from exc
    if response.status_code >= 400:
        message = extract_provider_error(response)
        response.close()
        client.close()
        raise AppError(code="provider_request_failed", message=message, status_code=502)
    return StreamingChatResponse(client=client, response=response)


def iterate_streaming_chat_response(stream: StreamingChatResponse) -> Iterator[str]:
    try:
        for line in stream.response.iter_lines():
            chunk = parse_streaming_chat_line(line)
            if chunk:
                yield chunk
    finally:
        stream.response.close()
        stream.client.close()


def parse_streaming_chat_line(line: str) -> str:
    stripped = line.strip()
    if not stripped.startswith(OPENAI_CHAT_STREAM_PREFIX):
        return ""
    return parse_streaming_chat_data(stripped.removeprefix(OPENAI_CHAT_STREAM_PREFIX).strip())


def parse_streaming_chat_data(data: str) -> str:
    if not data or data == OPENAI_CHAT_STREAM_DONE:
        return ""
    payload = json.loads(data)
    choices = payload.get("choices") if isinstance(payload, dict) else None
    if not isinstance(choices, list) or not choices:
        return ""
    choice = choices[0]
    if not isinstance(choice, dict):
        return ""
    return extract_streaming_content(choice.get("delta")) or extract_streaming_content(choice.get("message"))


def extract_streaming_content(value: object) -> str:
    if not isinstance(value, dict):
        return ""
    content = value.get("content")
    return content if isinstance(content, str) else ""
