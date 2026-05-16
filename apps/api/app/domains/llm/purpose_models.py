from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Mapping

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.core.config import get_settings
from apps.api.app.core.errors import AppError
from apps.api.app.domains.llm import openai_chat
from apps.api.app.domains.llm.catalog import ACTIVE_MODEL_STATUS, ensure_provider_catalog
from apps.api.app.domains.llm.client_provider import ClientProviderConfig
from apps.api.app.domains.llm.models import LlmPurposeModelSetting, Provider, SellableModel

LLM_PURPOSE_IMAGE_JOB_TITLE = "image_job_title"
LLM_PURPOSE_PROMPT_CRAFTER = "prompt_crafter"
LLM_PURPOSE_PROMPT_CRAFTER_REVERSE_IMAGE = "prompt_crafter_reverse_image"
LLM_PURPOSE_COMIC_STORY_ANALYSIS = "comic_story_analysis"
LLM_PURPOSE_COMIC_CHARACTER_BIBLE = "comic_character_bible"
LLM_PURPOSE_COMIC_STORYBOARD = "comic_storyboard"
LLM_PURPOSE_GALLERY_TAGGING = "gallery_tagging"
CHAT_CAPABILITIES = frozenset({"chat", "text"})


@dataclass(frozen=True)
class LlmPurposeDefinition:
    purpose: str
    label: str
    description: str


LLM_PURPOSES: tuple[LlmPurposeDefinition, ...] = (
    LlmPurposeDefinition(LLM_PURPOSE_IMAGE_JOB_TITLE, "生图历史标题", "为创作台首轮生图生成短标题。"),
    LlmPurposeDefinition(LLM_PURPOSE_PROMPT_CRAFTER, "提示词工坊", "提示词生成、优化和合规改写。"),
    LlmPurposeDefinition(LLM_PURPOSE_PROMPT_CRAFTER_REVERSE_IMAGE, "图片反推提示词", "根据上传图片反推生图提示词。"),
    LlmPurposeDefinition(LLM_PURPOSE_COMIC_STORY_ANALYSIS, "漫创剧情分析", "分析原始剧情、节奏和叙事结构。"),
    LlmPurposeDefinition(LLM_PURPOSE_COMIC_CHARACTER_BIBLE, "漫创角色设定", "生成角色卡和一致性描述。"),
    LlmPurposeDefinition(LLM_PURPOSE_COMIC_STORYBOARD, "漫创分镜", "按剧情片段生成漫画页分镜。"),
    LlmPurposeDefinition(LLM_PURPOSE_GALLERY_TAGGING, "图库自动打标", "为图库图片生成分类和标签。"),
)
LLM_PURPOSE_MAP = {item.purpose: item for item in LLM_PURPOSES}


def update_llm_purpose_model_codes(session: Session, codes: Mapping[str, object]) -> None:
    for purpose, value in codes.items():
        update_llm_purpose_model_code(session, purpose=purpose, value=value)


def update_llm_purpose_model_code(session: Session, *, purpose: str, value: object) -> None:
    definition = require_llm_purpose(purpose)
    model_code = normalize_model_code(value)
    if not model_code:
        delete_purpose_setting(session, purpose=definition.purpose)
        return
    model = require_chat_model(session, model_code=model_code)
    setting = session.get(LlmPurposeModelSetting, definition.purpose)
    if setting is None:
        session.add(LlmPurposeModelSetting(purpose=definition.purpose, model_code=model.code))
        return
    setting.model_code = model.code
    setting.updated_at = datetime.utcnow()


def llm_purpose_model_codes_payload(session: Session) -> dict[str, str]:
    settings = load_purpose_settings(session)
    return {purpose.purpose: settings.get(purpose.purpose, "") for purpose in LLM_PURPOSES}


def llm_purpose_models_payload(session: Session) -> list[dict[str, object]]:
    settings = load_purpose_settings(session)
    default_model_code = get_settings().openai_chat_model_code
    return [
        {
            "purpose": item.purpose,
            "label": item.label,
            "description": item.description,
            "model_code": settings.get(item.purpose, ""),
            "default_model_code": default_model_code,
        }
        for item in LLM_PURPOSES
    ]


def resolve_llm_purpose_model_code(session: Session, purpose: str, *, fallback_model_code: str | None = None) -> str | None:
    require_llm_purpose(purpose)
    setting = session.get(LlmPurposeModelSetting, purpose)
    if setting is not None and setting.model_code.strip():
        return setting.model_code
    fallback = (fallback_model_code or "").strip()
    return fallback or get_settings().openai_chat_model_code


def resolve_llm_purpose_chat_target(
    session: Session,
    *,
    purpose: str,
    client_provider_config: ClientProviderConfig | None = None,
) -> openai_chat.ChatTarget:
    model_code = resolve_llm_purpose_model_code(session, purpose)
    if client_provider_config is not None:
        provider_model = require_chat_model(session, model_code=model_code).provider_model
        return openai_chat.resolve_client_chat_target(client_provider_config, provider_model=provider_model)
    return openai_chat.resolve_chat_target(session, model_code=model_code)


def require_chat_model(session: Session, *, model_code: str | None) -> SellableModel:
    ensure_provider_catalog(session)
    code = normalize_model_code(model_code)
    statement = select(SellableModel, Provider).join(Provider, SellableModel.provider_id == Provider.id).where(
        SellableModel.code == code,
        SellableModel.capability.in_(CHAT_CAPABILITIES),
        SellableModel.status == ACTIVE_MODEL_STATUS,
        Provider.status == "active",
    )
    row = session.execute(statement).first()
    if row is None:
        raise AppError(code="llm_purpose_model_invalid", message=f"LLM purpose model invalid: {code}", status_code=422)
    return row[0]


def require_llm_purpose(purpose: str) -> LlmPurposeDefinition:
    definition = LLM_PURPOSE_MAP.get(purpose)
    if definition is None:
        raise AppError(code="llm_purpose_invalid", message=f"LLM purpose invalid: {purpose}", status_code=422)
    return definition


def normalize_model_code(value: object) -> str:
    return value.strip() if isinstance(value, str) else ""


def delete_purpose_setting(session: Session, *, purpose: str) -> None:
    setting = session.get(LlmPurposeModelSetting, purpose)
    if setting is not None:
        session.delete(setting)


def load_purpose_settings(session: Session) -> dict[str, str]:
    rows = session.execute(select(LlmPurposeModelSetting)).scalars()
    return {row.purpose: row.model_code for row in rows}
