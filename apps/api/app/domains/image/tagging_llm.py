from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from typing import cast

from sqlalchemy.orm import Session

from apps.api.app.core.errors import AppError
from apps.api.app.domains.image.models import Asset
from apps.api.app.domains.llm import openai_chat
from apps.api.app.domains.llm.openai_chat_image_messages import build_image_content
from apps.api.app.infra.storage.asset_storage import AssetStorage
from apps.api.app.infra.storage.factory import build_asset_storage

GALLERY_TAGGING_MAX_TAGS = 6
GALLERY_TAGGING_MAX_TAG_LENGTH = 24
GALLERY_TAGGING_TEMPERATURE = 0.2
GALLERY_TAGGING_MAX_TOKENS = 300
GALLERY_TAGGING_SCHEMA_NAME = "GalleryTagging"
GALLERY_TAGGING_RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "tags": {
            "type": "array",
            "items": {"type": "string"},
        }
    },
    "required": ["tags"],
}


@dataclass(frozen=True)
class GalleryTaggingContext:
    asset: Asset
    prompt: str
    revised_prompt: str | None


@dataclass(frozen=True)
class GalleryTaggingResult:
    tags: tuple[str, ...]
    model_code: str
    provider_model: str


def build_gallery_tagging_system_prompt() -> str:
    return (
        "你是专业的图库图片标签专家。"
        "只根据图片中真实可见的内容生成标签，原始提示词仅用于辅助，不得覆盖图片本身。"
        "必须只输出 JSON 对象，格式为 {\"tags\":[...]}，不要输出 Markdown、解释、标题或多余文本。"
        "标签要求精简、准确、可检索；通常 3 到 6 个，最多 6 个。"
        "每个标签必须是短词或短语，优先主体、场景、风格、色彩、材质、构图、光线等可见特征。"
        "不要输出泛化标签，例如 图片、照片、高清、好看、艺术、素材。"
        "不要推断无法直接看出的身份、职业、年龄、性别、种族、宗教、疾病、政治立场或其他敏感属性。"
        "如果某个信息不确定，就不要写。"
    )


def build_gallery_tagging_user_prompt(prompt: str, revised_prompt: str | None) -> str:
    parts = [
        "请为这张图库图片生成标签，优先保证准确和精简。",
        "只保留图中能直接看见的视觉信息；不要为了凑数量而补充不确定内容。",
    ]
    if prompt.strip():
        parts.append(f"原始提示词：{prompt.strip()}")
    if revised_prompt and revised_prompt.strip():
        parts.append(f"修订提示词：{revised_prompt.strip()}")
    return "\n".join(parts)


def generate_gallery_tags(
    session: Session,
    *,
    context: GalleryTaggingContext,
    model_code: str | None,
) -> GalleryTaggingResult:
    storage = build_asset_storage()
    asset = validate_gallery_tagging_asset(context.asset, storage=storage)
    target = openai_chat.resolve_chat_target(session, model_code=model_code)
    response = openai_chat.post_chat_completion(
        target=target,
        payload=build_gallery_tagging_payload(
            asset=asset,
            provider_model=target.provider_model,
            context=context,
            storage=storage,
        ),
    )
    parsed = openai_chat.parse_chat_response(response, response_schema=GALLERY_TAGGING_RESPONSE_SCHEMA)
    tags = normalize_generated_tags(cast(Sequence[object], parsed.get("tags")))
    return GalleryTaggingResult(tags=tuple(tags), model_code=model_code or "", provider_model=target.provider_model)


def build_gallery_tagging_payload(
    *,
    asset: Asset,
    provider_model: str,
    context: GalleryTaggingContext,
    storage: AssetStorage,
) -> dict[str, object]:
    return {
        "model": provider_model,
        "messages": [
            {"role": "system", "content": build_gallery_tagging_system_prompt()},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": build_gallery_tagging_user_prompt(context.prompt, context.revised_prompt)},
                    build_image_content(asset, storage=storage),
                ],
            },
        ],
        "temperature": GALLERY_TAGGING_TEMPERATURE,
        "max_tokens": GALLERY_TAGGING_MAX_TOKENS,
        "response_format": {"type": "json_object"},
        "metadata": {"schema_name": GALLERY_TAGGING_SCHEMA_NAME},
    }


def validate_gallery_tagging_asset(asset: Asset, *, storage: AssetStorage) -> Asset:
    if not asset.mime_type.startswith("image/"):
        raise AppError(code="asset_tagging_asset_invalid", message="asset tagging asset is not an image", status_code=422)
    if not asset.storage_path or not storage.exists(asset.storage_path):
        raise AppError(code="asset_tagging_asset_missing", message="asset tagging asset file missing", status_code=500)
    return asset


def normalize_generated_tags(values: Sequence[object] | None) -> list[str]:
    tags = list(values or [])
    if not tags:
        raise AppError(code="image_asset_tagging_empty", message="gallery tags are required", status_code=502)
    if len(tags) > GALLERY_TAGGING_MAX_TAGS:
        raise AppError(code="image_asset_tagging_too_many", message="too many gallery tags", status_code=502)
    normalized_tags: list[str] = []
    seen_tags: set[str] = set()
    for raw_tag in tags:
        tag = normalize_gallery_tag_value(raw_tag)
        if len(tag) > GALLERY_TAGGING_MAX_TAG_LENGTH:
            raise AppError(code="image_asset_tagging_tag_too_long", message="gallery tag too long", status_code=502)
        key = normalize_gallery_tag(tag)
        if key in seen_tags:
            raise AppError(code="image_asset_tagging_duplicate", message="duplicate gallery tag", status_code=502)
        seen_tags.add(key)
        normalized_tags.append(tag)
    return normalized_tags


def normalize_gallery_tag_value(value: object) -> str:
    if not isinstance(value, str):
        raise AppError(code="image_asset_tagging_invalid_tag", message="gallery tag must be a string", status_code=502)
    tag = " ".join(value.split()).strip()
    if not tag:
        raise AppError(code="image_asset_tagging_invalid_tag", message="gallery tag cannot be empty", status_code=502)
    return tag


def normalize_gallery_tag(value: str) -> str:
    return " ".join(value.split()).strip().casefold()
