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
from apps.api.app.domains.auth.ownership import OwnerContext
from apps.api.app.domains.image.models import Asset
from apps.api.app.domains.image.repository import get_asset_for_owner
from apps.api.app.domains.llm import openai_chat_stream
from apps.api.app.domains.llm.client_provider import ClientProviderConfig
from apps.api.app.domains.llm.openai_chat_image_messages import build_image_content
from apps.api.app.domains.llm.openai_chat import ChatTarget, resolve_chat_target_for_config
from apps.api.app.infra.storage.asset_storage import AssetStorage
from apps.api.app.infra.storage.factory import build_asset_storage

PROMPT_CRAFTER_SKILL_NAME = "gpt-image-2-prompt-crafter"
PROMPT_CRAFTER_SKILL_FILE = "SKILL.md"
PROMPT_CRAFTER_PATTERN_FILE = Path("references") / "prompt-patterns.md"
PROMPT_CRAFTER_SYSTEM_PREFIX = "你正在使用 gpt-image-2-prompt-crafter skill。请严格遵守下面的 skill 与参考模式。"
PROMPT_CRAFTER_REVERSE_IMAGE_SYSTEM_PROMPT = """
你是专业的图片反推提示词专家。你的任务是观察用户上传的原图，反推出一段可直接用于图像生成模型复现原图视觉效果的高细节提示词。

输出要求：
- 只输出一段完整提示词，不要输出 Markdown 标题、列表、解释、分析过程、寒暄或多个方案。
- 提示词必须尽量贴合原图，覆盖主体、数量、姿态、表情、服饰、材质、场景、构图、镜头、景别、光线、色彩、质感、文字元素、画幅比例和风格。
- 原图中可见的品牌、包装、界面、文字或符号要作为视觉元素描述；不能确定的内容不要臆造为确定事实。
- 保持中性描述，避免把图片不存在的对象、动作、背景或风格加入提示词。
- 输出应适合 OpenAI 兼容图像生成模型直接使用。
""".strip()
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
PROMPT_CRAFTER_IMAGE_REQUIRED_CODE = "prompt_crafter_image_required"
PROMPT_CRAFTER_IMAGE_INVALID_CODE = "prompt_crafter_image_invalid"
PROMPT_CRAFTER_IMAGE_FILE_MISSING_CODE = "prompt_crafter_image_file_missing"
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


def build_prompt_crafter_reverse_image_system_prompt() -> str:
    return PROMPT_CRAFTER_REVERSE_IMAGE_SYSTEM_PROMPT


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


def stream_prompt_crafter_reverse_image_sse_completion(
    session: Session,
    *,
    owner: OwnerContext,
    asset_ids: Sequence[int],
    note: str = "",
    client_provider_config: ClientProviderConfig | None = None,
) -> Iterator[str]:
    context = prepare_prompt_crafter_reverse_image_context(
        session,
        owner=owner,
        asset_ids=asset_ids,
        note=note,
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


def prepare_prompt_crafter_reverse_image_context(
    session: Session,
    *,
    owner: OwnerContext,
    asset_ids: Sequence[int],
    note: str,
    client_provider_config: ClientProviderConfig | None = None,
) -> PromptCrafterStreamContext:
    target = resolve_prompt_crafter_target(session, client_provider_config)
    storage = build_asset_storage()
    assets = resolve_prompt_crafter_image_assets(session, owner=owner, asset_ids=asset_ids, storage=storage)
    payload = build_prompt_crafter_reverse_image_payload(
        provider_model=target.provider_model,
        note=note,
        assets=assets,
        storage=storage,
    )
    return PromptCrafterStreamContext(target=target, payload=payload)


def build_prompt_crafter_reverse_image_payload(
    *,
    provider_model: str,
    note: str,
    assets: Sequence[Asset],
    storage: AssetStorage,
) -> dict[str, object]:
    content = [{"type": "text", "text": build_prompt_crafter_reverse_image_user_text(note)}]
    content.extend(build_image_content(asset, storage=storage) for asset in assets)
    return {
        "model": provider_model,
        "messages": [
            {"role": "system", "content": build_prompt_crafter_reverse_image_system_prompt()},
            {"role": "user", "content": content},
        ],
        "stream": True,
    }


def build_prompt_crafter_reverse_image_user_text(note: str) -> str:
    base = "请根据上传图片反推一段高细节生图提示词，目标是尽量复现原图的视觉内容和风格。"
    trimmed = note.strip()
    if not trimmed:
        return base
    return f"{base}\n用户补充要求：{trimmed}"


def resolve_prompt_crafter_image_assets(
    session: Session,
    *,
    owner: OwnerContext,
    asset_ids: Sequence[int],
    storage: AssetStorage,
) -> list[Asset]:
    if not asset_ids:
        raise AppError(code=PROMPT_CRAFTER_IMAGE_REQUIRED_CODE, message="reverse image assets are required", status_code=422)
    assets = [get_asset_for_owner(session, int(asset_id), owner) for asset_id in asset_ids]
    for asset in assets:
        validate_prompt_crafter_image_asset(asset, storage=storage)
    return assets


def validate_prompt_crafter_image_asset(asset: Asset, *, storage: AssetStorage) -> None:
    if not asset.mime_type.startswith("image/"):
        raise AppError(code=PROMPT_CRAFTER_IMAGE_INVALID_CODE, message="reverse asset must be an image", status_code=422)
    if not asset.storage_path or not storage.exists(asset.storage_path):
        raise AppError(code=PROMPT_CRAFTER_IMAGE_FILE_MISSING_CODE, message="reverse image file is missing", status_code=500)


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
