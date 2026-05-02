from __future__ import annotations

from collections.abc import Iterator, Sequence
from itertools import chain
from pathlib import Path

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
PROMPT_CRAFTER_SKILL_MISSING_CODE = "prompt_crafter_skill_missing"
PROMPT_CRAFTER_MESSAGE_INVALID_CODE = "prompt_crafter_message_invalid"


def build_prompt_crafter_system_prompt() -> str:
    skill_dir = resolve_prompt_crafter_skill_dir()
    skill_text = read_required_text(skill_dir / PROMPT_CRAFTER_SKILL_FILE)
    pattern_text = read_required_text(skill_dir / PROMPT_CRAFTER_PATTERN_FILE)
    return "\n\n".join([PROMPT_CRAFTER_SYSTEM_PREFIX, skill_text, pattern_text])


def stream_prompt_crafter_completion(
    session: Session,
    *,
    messages: Sequence[dict[str, str]],
    client_provider_config: ClientProviderConfig | None = None,
) -> Iterator[str]:
    validate_prompt_crafter_messages(messages)
    target = resolve_prompt_crafter_target(session, client_provider_config)
    payload = openai_chat_stream.build_streaming_chat_payload(
        provider_model=target.provider_model,
        system_prompt=build_prompt_crafter_system_prompt(),
        messages=list(messages),
    )
    return prime_prompt_crafter_stream(openai_chat_stream.stream_chat_completion(target=target, payload=payload))


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
