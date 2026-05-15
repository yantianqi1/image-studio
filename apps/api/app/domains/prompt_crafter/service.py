from __future__ import annotations

from dataclasses import dataclass
from collections.abc import Iterator, Sequence
from itertools import chain
import json
from pathlib import Path

import httpx
from sqlalchemy.orm import Session

from apps.api.app.core.config import get_settings
from apps.api.app.core.errors import AppError
from apps.api.app.domains.llm import openai_chat_stream
from apps.api.app.domains.llm.client_provider import ClientProviderConfig
from apps.api.app.domains.llm.openai_chat import ChatTarget, resolve_chat_target_for_config

PROMPT_CRAFTER_SKILL_NAME = "gpt-image-2-prompt-crafter"
PROMPT_CRAFTER_SKILL_FILE = "SKILL.md"
PROMPT_CRAFTER_PATTERN_FILE = Path("references") / "prompt-patterns.md"
PROMPT_CRAFTER_SYSTEM_PREFIX = "你正在使用 gpt-image-2-prompt-crafter skill。请严格遵守下面的 skill 与参考模式。"
PROMPT_CRAFTER_FORMAT_CONTRACT = """
常规提示词工坊请求必须输出严格 Markdown，并且只输出三套备选提示词。不要输出解释、分析过程、寒暄、总结或提示词之外的说明。

严格 Markdown 结构如下，每套方案必须包含一个二级标题和一个 prompt 代码块：
## 方案 1：{方向名称}
```prompt
{可直接粘贴到生图模型的一整段提示词}
```

## 方案 2：{方向名称}
```prompt
{可直接粘贴到生图模型的一整段提示词}
```

## 方案 3：{方向名称}
```prompt
{可直接粘贴到生图模型的一整段提示词}
```

三套备选提示词必须显著不同，分别在场景、镜头、构图、光线、材质、情绪或视觉系统上拉开差异；每套都要保留用户明确需求，补足用户没有说清但会影响画面质感的关键视觉信息，并保持合规安全。对于明确要求“只输出一段纯提示词”的内部工具请求，按用户指定格式输出单条纯提示词。
""".strip()
PROMPT_CRAFTER_SKILL_MISSING_CODE = "prompt_crafter_skill_missing"
PROMPT_CRAFTER_MESSAGE_INVALID_CODE = "prompt_crafter_message_invalid"
PROMPT_CRAFTER_SSE_EVENT_START = "start"
PROMPT_CRAFTER_SSE_EVENT_CHUNK = "chunk"
PROMPT_CRAFTER_SSE_EVENT_DONE = "done"
PROMPT_CRAFTER_SSE_EVENT_ERROR = "error"


@dataclass(frozen=True)
class PromptCrafterStreamContext:
    target: ChatTarget
    payload: dict[str, object]


def build_prompt_crafter_system_prompt() -> str:
    skill_dir = resolve_prompt_crafter_skill_dir()
    skill_text = read_required_text(skill_dir / PROMPT_CRAFTER_SKILL_FILE)
    pattern_text = read_required_text(skill_dir / PROMPT_CRAFTER_PATTERN_FILE)
    return "\n\n".join([PROMPT_CRAFTER_SYSTEM_PREFIX, PROMPT_CRAFTER_FORMAT_CONTRACT, skill_text, pattern_text])


def stream_prompt_crafter_completion(
    session: Session,
    *,
    messages: Sequence[dict[str, str]],
    client_provider_config: ClientProviderConfig | None = None,
) -> Iterator[str]:
    context = prepare_prompt_crafter_stream_context(
        session,
        messages=messages,
        client_provider_config=client_provider_config,
    )
    return prime_prompt_crafter_stream(
        openai_chat_stream.stream_chat_completion(target=context.target, payload=context.payload)
    )


def stream_prompt_crafter_sse_completion(
    session: Session,
    *,
    messages: Sequence[dict[str, str]],
    client_provider_config: ClientProviderConfig | None = None,
) -> Iterator[str]:
    context = prepare_prompt_crafter_stream_context(
        session,
        messages=messages,
        client_provider_config=client_provider_config,
    )
    return iterate_prompt_crafter_sse_stream(context)


def prepare_prompt_crafter_stream_context(
    session: Session,
    *,
    messages: Sequence[dict[str, str]],
    client_provider_config: ClientProviderConfig | None = None,
) -> PromptCrafterStreamContext:
    validate_prompt_crafter_messages(messages)
    target = resolve_prompt_crafter_target(session, client_provider_config)
    payload = openai_chat_stream.build_streaming_chat_payload(
        provider_model=target.provider_model,
        system_prompt=build_prompt_crafter_system_prompt(),
        messages=list(messages),
    )
    return PromptCrafterStreamContext(target=target, payload=payload)


def resolve_prompt_crafter_target(session: Session, client_provider_config: ClientProviderConfig | None) -> ChatTarget:
    if client_provider_config is None:
        return resolve_chat_target_for_config(session, None)
    typed_config = ClientProviderConfig(
        client_id=client_provider_config.client_id,
        base_url=client_provider_config.base_url,
        api_key=client_provider_config.api_key,
        provider_type=get_settings().openai_provider_type,
    )
    return resolve_chat_target_for_config(session, typed_config)


def validate_prompt_crafter_messages(messages: Sequence[dict[str, str]]) -> None:
    if not messages:
        raise AppError(code=PROMPT_CRAFTER_MESSAGE_INVALID_CODE, message="prompt crafter messages are required", status_code=422)
    if not any(is_user_message(message) for message in messages):
        raise AppError(code=PROMPT_CRAFTER_MESSAGE_INVALID_CODE, message="prompt crafter requires a user message", status_code=422)


def is_user_message(message: dict[str, str]) -> bool:
    return message.get("role") == "user" and bool(message.get("content", "").strip())


def prime_prompt_crafter_stream(stream: Iterator[str]) -> Iterator[str]:
    try:
        first_chunk = next(stream)
    except StopIteration as exc:
        raise AppError(code="provider_response_invalid", message="provider response empty", status_code=502) from exc
    return chain([first_chunk], stream)


def iterate_prompt_crafter_sse_stream(context: PromptCrafterStreamContext) -> Iterator[str]:
    yield build_prompt_crafter_sse_event(PROMPT_CRAFTER_SSE_EVENT_START, {})
    try:
        for chunk in openai_chat_stream.stream_chat_completion(target=context.target, payload=context.payload):
            yield build_prompt_crafter_sse_event(PROMPT_CRAFTER_SSE_EVENT_CHUNK, {"content": chunk})
    except AppError as exc:
        yield build_prompt_crafter_sse_event(
            PROMPT_CRAFTER_SSE_EVENT_ERROR,
            {"code": exc.code, "message": exc.message},
        )
    except httpx.HTTPError as exc:
        yield build_prompt_crafter_sse_event(
            PROMPT_CRAFTER_SSE_EVENT_ERROR,
            {"code": "provider_request_failed", "message": str(exc)},
        )
    except OSError as exc:
        yield build_prompt_crafter_sse_event(
            PROMPT_CRAFTER_SSE_EVENT_ERROR,
            {"code": "provider_request_failed", "message": str(exc)},
        )
    else:
        yield build_prompt_crafter_sse_event(PROMPT_CRAFTER_SSE_EVENT_DONE, {})


def build_prompt_crafter_sse_event(event: str, payload: dict[str, str]) -> str:
    return f"event: {event}\ndata: {json.dumps(payload, ensure_ascii=False, separators=(',', ':'))}\n\n"


def resolve_prompt_crafter_skill_dir() -> Path:
    current = Path(__file__).resolve()
    for parent in current.parents:
        skill_dir = parent / ".codex" / "skills" / PROMPT_CRAFTER_SKILL_NAME
        if skill_dir.is_dir():
            return skill_dir
    raise AppError(code=PROMPT_CRAFTER_SKILL_MISSING_CODE, message="prompt crafter skill assets are missing", status_code=500)


def read_required_text(path: Path) -> str:
    if not path.is_file():
        raise AppError(code=PROMPT_CRAFTER_SKILL_MISSING_CODE, message=f"missing prompt crafter asset: {path.name}", status_code=500)
    return path.read_text(encoding="utf-8")
