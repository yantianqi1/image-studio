from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.core.config import AppSettings, get_settings
from apps.api.app.core.errors import AppError
from apps.api.app.domains.llm.catalog import ensure_provider_catalog
from apps.api.app.domains.llm.models import LLMFeatureModelSetting, SellableModel

FEATURE_PROMPT_CRAFTER_TEXT = "prompt_crafter_text"
FEATURE_PROMPT_CRAFTER_REVERSE_IMAGE = "prompt_crafter_reverse_image"
FEATURE_IMAGE_JOB_TITLE = "image_job_title"
FEATURE_COMIC_STORY_ANALYSIS = "comic_story_analysis"
FEATURE_COMIC_CHARACTER_BIBLE = "comic_character_bible"
FEATURE_COMIC_STORYBOARD = "comic_storyboard"
FEATURE_COMIC_IMAGE_GENERATION = "comic_image_generation"
FEATURE_COMIC_CHARACTER_REFERENCE = "comic_character_reference"
CHAT_CAPABILITIES = ("chat", "text")
IMAGE_CAPABILITIES = ("image",)
MULTIMODAL_INPUT_MODE = "multimodal"
TEXT_INPUT_MODE = "text"
IMAGE_INPUT_MODE = "image"


@dataclass(frozen=True)
class LLMFeatureDefinition:
    key: str
    display_name: str
    description: str
    input_mode: str
    required_capabilities: tuple[str, ...]
    default_model_code: str


def build_llm_feature_definitions(settings: AppSettings | None = None) -> tuple[LLMFeatureDefinition, ...]:
    config = settings or get_settings()
    chat_model = config.openai_chat_model_code.strip()
    title_model = config.image_job_title_model_code.strip() or chat_model
    image_model = config.openai_image_model_code.strip() or "gpt-image-2"
    return (
        feature(FEATURE_PROMPT_CRAFTER_TEXT, "提示词工坊文本", "合规化、优化和普通提示词工坊对话。", TEXT_INPUT_MODE, CHAT_CAPABILITIES, chat_model),
        feature(FEATURE_PROMPT_CRAFTER_REVERSE_IMAGE, "图片反推提示词", "上传图片后反推出可复用生图提示词。", MULTIMODAL_INPUT_MODE, CHAT_CAPABILITIES, chat_model),
        feature(FEATURE_IMAGE_JOB_TITLE, "创作记录标题", "根据生图提示词生成历史记录短标题。", TEXT_INPUT_MODE, CHAT_CAPABILITIES, title_model),
        feature(FEATURE_COMIC_STORY_ANALYSIS, "漫创剧情分析", "将原文分析成漫画创作结构。", TEXT_INPUT_MODE, CHAT_CAPABILITIES, chat_model),
        feature(FEATURE_COMIC_CHARACTER_BIBLE, "漫创角色设定", "生成角色卡、外观和一致性约束。", TEXT_INPUT_MODE, CHAT_CAPABILITIES, chat_model),
        feature(FEATURE_COMIC_STORYBOARD, "漫创分镜生成", "按片段生成分镜和画面结构。", TEXT_INPUT_MODE, CHAT_CAPABILITIES, chat_model),
        feature(FEATURE_COMIC_IMAGE_GENERATION, "漫创页面生图", "漫画页面最终生图任务默认模型。", IMAGE_INPUT_MODE, IMAGE_CAPABILITIES, image_model),
        feature(FEATURE_COMIC_CHARACTER_REFERENCE, "漫创角色参考图", "角色设定图和合集参考图默认模型。", IMAGE_INPUT_MODE, IMAGE_CAPABILITIES, image_model),
    )


def feature(
    key: str,
    display_name: str,
    description: str,
    input_mode: str,
    capabilities: tuple[str, ...],
    model_code: str,
) -> LLMFeatureDefinition:
    return LLMFeatureDefinition(
        key=key,
        display_name=display_name,
        description=description,
        input_mode=input_mode,
        required_capabilities=capabilities,
        default_model_code=model_code,
    )


def list_llm_feature_model_settings(session: Session) -> list[LLMFeatureModelSetting]:
    ensure_llm_feature_model_settings(session)
    statement = select(LLMFeatureModelSetting).order_by(LLMFeatureModelSetting.id.asc())
    return list(session.execute(statement).scalars())


def ensure_llm_feature_model_settings(session: Session) -> None:
    ensure_provider_catalog(session)
    existing = {
        setting.feature_key
        for setting in session.execute(select(LLMFeatureModelSetting)).scalars()
    }
    for definition in build_llm_feature_definitions():
        if definition.key not in existing:
            session.add(LLMFeatureModelSetting(feature_key=definition.key, model_code=definition.default_model_code))
    session.flush()


def update_llm_feature_model_settings(
    session: Session,
    updates: Mapping[str, str],
) -> list[LLMFeatureModelSetting]:
    ensure_llm_feature_model_settings(session)
    settings_by_key = {setting.feature_key: setting for setting in list_llm_feature_model_settings(session)}
    for feature_key, model_code in updates.items():
        definition = get_llm_feature_definition(feature_key)
        validate_feature_model(session, definition=definition, model_code=model_code)
        setting = settings_by_key.get(feature_key)
        if setting is None:
            raise AppError(code="llm_feature_unknown", message="LLM feature is unknown", status_code=422)
        setting.model_code = model_code.strip()
        setting.updated_at = datetime.utcnow()
    session.flush()
    return list(settings_by_key.values())


def get_llm_feature_model_code(session: Session, feature_key: str) -> str:
    setting = get_llm_feature_model_setting(session, feature_key)
    definition = get_llm_feature_definition(feature_key)
    validate_feature_model(session, definition=definition, model_code=setting.model_code)
    return setting.model_code


def get_llm_feature_model_setting(session: Session, feature_key: str) -> LLMFeatureModelSetting:
    ensure_llm_feature_model_settings(session)
    setting = session.execute(
        select(LLMFeatureModelSetting).where(LLMFeatureModelSetting.feature_key == feature_key)
    ).scalar_one_or_none()
    if setting is None:
        raise AppError(code="llm_feature_unknown", message="LLM feature is not configured", status_code=422)
    return setting


def get_llm_feature_definition(feature_key: str) -> LLMFeatureDefinition:
    for definition in build_llm_feature_definitions():
        if definition.key == feature_key:
            return definition
    raise AppError(code="llm_feature_unknown", message="LLM feature is unknown", status_code=422)


def validate_feature_model(
    session: Session,
    *,
    definition: LLMFeatureDefinition,
    model_code: str,
) -> SellableModel:
    model = get_active_model_by_code(session, model_code.strip())
    if model.capability not in definition.required_capabilities:
        raise AppError(code="llm_feature_model_invalid", message="LLM feature model capability invalid", status_code=422)
    return model


def get_active_model_by_code(session: Session, model_code: str) -> SellableModel:
    model = session.execute(
        select(SellableModel).where(SellableModel.code == model_code, SellableModel.status == "active")
    ).scalar_one_or_none()
    if model is None:
        raise AppError(code="llm_feature_model_missing", message="LLM feature model is missing", status_code=422)
    return model


def list_llm_feature_definitions() -> tuple[LLMFeatureDefinition, ...]:
    return build_llm_feature_definitions()


def list_allowed_llm_models(session: Session) -> list[SellableModel]:
    ensure_provider_catalog(session)
    capabilities = tuple(sorted({cap for definition in list_llm_feature_definitions() for cap in definition.required_capabilities}))
    statement = (
        select(SellableModel)
        .where(SellableModel.status == "active", SellableModel.capability.in_(capabilities))
        .order_by(SellableModel.capability.asc(), SellableModel.code.asc())
    )
    return list(session.execute(statement).scalars())
