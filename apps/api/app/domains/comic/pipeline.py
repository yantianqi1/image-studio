from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256
from typing import Any

from pydantic import ValidationError
from sqlalchemy.orm import Session

from apps.api.app.core.config import get_settings
from apps.api.app.core.errors import AppError
from apps.api.app.domains.comic.character_references import parse_character_reference_mode
from apps.api.app.domains.comic.llm_prompts import (
    CHARACTER_DESIGNER_SYSTEM_PROMPT,
    STORY_ANALYZER_SYSTEM_PROMPT,
    STORYBOARD_DIRECTOR_SYSTEM_PROMPT,
)
from apps.api.app.domains.comic.models import ComicCharacterCard, ComicPanelPrompt, ComicStoryboard, ComicStoryAnalysis, ComicTask
from apps.api.app.domains.comic.prompt_composer import compose_panel_prompts
from apps.api.app.domains.comic.repository import (
    create_character_cards,
    create_panel_prompts,
    create_story_analysis,
    create_storyboard,
    mark_task_completed,
    require_project,
    update_task_stage,
)
from apps.api.app.domains.comic.storage import ASSET_FOLDER_NAME_OUTPUT_KEY, build_asset_folder_name
from apps.api.app.domains.comic.storyboard_generation import (
    build_storyboard_generation_context,
    build_storyboard_input,
    generate_storyboard_pages,
    serialize_analysis,
    validate_storyboard_image_indexes,
)
from apps.api.app.domains.comic.structured_outputs import CharacterBible, StoryAnalysis, Storyboard
from apps.api.app.domains.comic.story_segments import build_story_segments, parse_target_image_count
from apps.api.app.domains.comic.style_presets import DEFAULT_STYLE_PRESET_ID, normalize_style_preset_id
from apps.api.app.domains.llm import openai_chat
from apps.api.app.domains.llm.client_provider import ClientProviderConfig, client_provider_config_from_mapping
from apps.api.app.domains.llm.purpose_models import LLM_PURPOSE_COMIC_CHARACTER_BIBLE, LLM_PURPOSE_COMIC_STORY_ANALYSIS, LLM_PURPOSE_COMIC_STORYBOARD, resolve_llm_purpose_chat_target

COMIC_LLM_SCHEMA_INVALID_ERROR_CODE = "comic_llm_schema_invalid"
COMIC_LLM_NOT_CONFIGURED_ERROR_CODE = "comic_llm_not_configured"
DEFAULT_PANELS_PER_IMAGE = 4
DEFAULT_TARGET_IMAGE_COUNT = 1
DEFAULT_IMAGE_MODEL_CODE = "gpt-image-2"
PROMPT_READY_STATUS = "prompt_ready"
UNSUPPORTED_SOURCE_TYPE_ERROR_CODE = "unsupported_source_type"


@dataclass(frozen=True)
class PipelineInputs:
    source_text: str
    source_text_hash: str
    style_preset: str
    panels_per_image: int
    target_image_count: int
    story_segments: list[dict[str, Any]]
    image_model_code: str
    character_reference_mode: str
    client_provider_config: ClientProviderConfig | None


def run_comic_pipeline(session: Session, *, task: ComicTask) -> ComicTask:
    inputs = parse_pipeline_inputs(task)
    project = require_project(session, task.project_id)
    analysis = run_story_analysis(session, task=task, inputs=inputs)
    bible = run_character_bible(session, task=task, inputs=inputs, analysis=analysis)
    storyboard = run_storyboard(session, task=task, inputs=inputs, analysis=analysis, bible=bible)
    prompt_count = run_prompting(session, task=task, inputs=inputs, storyboard=storyboard, bible=bible)
    return mark_task_completed(
        session,
        task=task,
        output_payload={
            "story_analysis_id": analysis.id,
            "character_count": len(bible.characters),
            "storyboard_id": storyboard.id,
            "prompt_count": prompt_count,
            "style_preset": inputs.style_preset,
            "panels_per_image": inputs.panels_per_image,
            "source_text_length": len(inputs.source_text),
            "target_image_count": inputs.target_image_count,
            "story_segment_count": len(inputs.story_segments),
            "character_reference_mode": inputs.character_reference_mode,
            ASSET_FOLDER_NAME_OUTPUT_KEY: build_asset_folder_name(
                project_title=project.title,
                task_id=task.id,
            ),
        },
    )


def parse_pipeline_inputs(task: ComicTask) -> PipelineInputs:
    payload = dict(task.input_payload)
    if payload.get("source_type", "text") == "file":
        raise AppError(code=UNSUPPORTED_SOURCE_TYPE_ERROR_CODE, message="comic file source parsing is not implemented", status_code=422)
    source_text = str(payload.get("source_text") or "").strip()
    if not source_text:
        raise AppError(code="comic_source_text_required", message="comic source_text is required", status_code=422)
    style_preset = normalize_style_preset_id(payload.get("style_preset") or DEFAULT_STYLE_PRESET_ID)
    target_image_count = parse_target_image_count(payload.get("target_image_count"), source_text=source_text)
    story_segments = build_story_segments(source_text, target_image_count=target_image_count)
    character_reference_mode = parse_character_reference_mode(payload)
    return PipelineInputs(
        source_text=source_text,
        source_text_hash=sha256(source_text.encode("utf-8")).hexdigest(),
        style_preset=style_preset,
        panels_per_image=int(payload.get("panels_per_image") or DEFAULT_PANELS_PER_IMAGE),
        target_image_count=len(story_segments),
        story_segments=story_segments,
        image_model_code=str(payload.get("image_model_code") or get_settings().openai_image_model_code or DEFAULT_IMAGE_MODEL_CODE),
        character_reference_mode=character_reference_mode,
        client_provider_config=parse_task_client_provider_config(task),
    )


def run_story_analysis(session: Session, *, task: ComicTask, inputs: PipelineInputs) -> ComicStoryAnalysis:
    publish_task_stage(session, task=task, stage="analyzing", progress_percent=10)
    payload = call_structured_llm(
        session=session,
        schema=StoryAnalysis,
        schema_name="StoryAnalysis",
        system_prompt=STORY_ANALYZER_SYSTEM_PROMPT,
        user_payload={"source_text": inputs.source_text},
        client_provider_config=inputs.client_provider_config,
        purpose=LLM_PURPOSE_COMIC_STORY_ANALYSIS,
    )
    analysis = ComicStoryAnalysis(task_id=task.id, project_id=task.project_id, source_text_hash=inputs.source_text_hash, **payload.model_dump())
    return create_story_analysis(session, analysis=analysis)


def run_character_bible(session: Session, *, task: ComicTask, inputs: PipelineInputs, analysis: ComicStoryAnalysis) -> CharacterBible:
    publish_task_stage(session, task=task, stage="characterizing", progress_percent=35)
    bible = call_structured_llm(
        session=session,
        schema=CharacterBible,
        schema_name="CharacterBible",
        system_prompt=CHARACTER_DESIGNER_SYSTEM_PROMPT,
        user_payload={"story_analysis": serialize_analysis(analysis), "source_text": inputs.source_text},
        client_provider_config=inputs.client_provider_config,
        purpose=LLM_PURPOSE_COMIC_CHARACTER_BIBLE,
    )
    cards = [build_character_card(task=task, character=character.model_dump()) for character in bible.characters]
    create_character_cards(session, cards=cards)
    return bible


def run_storyboard(session: Session, *, task: ComicTask, inputs: PipelineInputs, analysis: ComicStoryAnalysis, bible: CharacterBible) -> ComicStoryboard:
    publish_task_stage(session, task=task, stage="storyboarding", progress_percent=60)
    chat_target = resolve_llm_purpose_chat_target(session, purpose=LLM_PURPOSE_COMIC_STORYBOARD, client_provider_config=inputs.client_provider_config)
    context = build_storyboard_generation_context(inputs=inputs, analysis=analysis, bible=bible)
    storyboard = generate_storyboard_pages(
        context=context,
        call_storyboard_llm=lambda user_payload: call_structured_llm(
            session=session,
            schema=Storyboard,
            schema_name="Storyboard",
            system_prompt=STORYBOARD_DIRECTOR_SYSTEM_PROMPT,
            user_payload=user_payload,
            client_provider_config=inputs.client_provider_config,
            payload_defaults={"style_preset": inputs.style_preset, "panels_per_image": inputs.panels_per_image},
            chat_target=chat_target,
            purpose=LLM_PURPOSE_COMIC_STORYBOARD,
        ),
    )
    validate_storyboard_image_count(storyboard, expected_image_count=inputs.target_image_count)
    validate_storyboard_image_indexes(storyboard, expected_indexes=[segment["segment_index"] for segment in inputs.story_segments])
    validate_storyboard_panel_counts(storyboard, expected_panels_per_image=inputs.panels_per_image)
    validate_storyboard_character_codes(storyboard, bible=bible)
    model = ComicStoryboard(project_id=task.project_id, task_id=task.id, style_preset=inputs.style_preset, panels_per_image=inputs.panels_per_image, target_image_count=inputs.target_image_count, payload=storyboard.model_dump())
    return create_storyboard(session, storyboard=model)


def run_prompting(session: Session, *, task: ComicTask, inputs: PipelineInputs, storyboard: ComicStoryboard, bible: CharacterBible) -> int:
    publish_task_stage(session, task=task, stage="prompting", progress_percent=85)
    parsed_storyboard = Storyboard.model_validate(storyboard.payload)
    prompt_drafts = compose_panel_prompts(storyboard=parsed_storyboard, character_bible=bible, style_preset_id=inputs.style_preset, model_code=inputs.image_model_code)
    prompts = [build_panel_prompt(task=task, storyboard_id=storyboard.id, draft=draft) for draft in prompt_drafts]
    create_panel_prompts(session, prompts=prompts)
    return len(prompts)


def call_structured_llm(
    *,
    session: Session,
    schema,
    schema_name: str,
    system_prompt: str,
    user_payload: dict,
    client_provider_config: ClientProviderConfig | None,
    purpose: str,
    payload_defaults: dict | None = None,
    chat_target: openai_chat.ChatTarget | None = None,
):
    try:
        target = chat_target or resolve_llm_purpose_chat_target(session, purpose=purpose, client_provider_config=client_provider_config)
        payload = openai_chat.generate_structured_chat(
            session,
            system_prompt=system_prompt,
            user_payload=user_payload,
            schema_name=schema_name,
            response_schema=schema.model_json_schema(),
            client_provider_config=client_provider_config,
            chat_target=target,
        )
        return schema.model_validate(apply_payload_defaults(payload, payload_defaults))
    except AppError as exc:
        if exc.code in {"provider_api_key_missing", "provider_base_url_missing", "provider_model_missing"}:
            raise AppError(
                code=COMIC_LLM_NOT_CONFIGURED_ERROR_CODE,
                message=f"comic LLM adapter is not configured: {exc.message}",
                status_code=500,
            ) from exc
        raise
    except ValidationError as exc:
        raise AppError(code=COMIC_LLM_SCHEMA_INVALID_ERROR_CODE, message=str(exc), status_code=502) from exc


def apply_payload_defaults(payload: object, defaults: dict | None) -> object:
    if not isinstance(payload, dict) or not defaults:
        return payload
    return {**defaults, **payload}


def publish_task_stage(session: Session, *, task: ComicTask, stage: str, progress_percent: int) -> ComicTask:
    update_task_stage(session, task=task, stage=stage, progress_percent=progress_percent)
    session.commit()
    return task


def parse_task_client_provider_config(task: ComicTask) -> ClientProviderConfig | None:
    task_config = getattr(task, "client_provider_config", None)
    if not task_config:
        return None
    return client_provider_config_from_mapping(task_config)


def validate_storyboard_panel_counts(storyboard: Storyboard, *, expected_panels_per_image: int) -> None:
    if storyboard.panels_per_image != expected_panels_per_image:
        raise AppError(
            code=COMIC_LLM_SCHEMA_INVALID_ERROR_CODE,
            message=(
                "storyboard panels_per_image mismatch: "
                f"expected={expected_panels_per_image}, actual={storyboard.panels_per_image}"
            ),
            status_code=502,
        )
    for index, image in enumerate(storyboard.images):
        panel_count = len(image.panels)
        is_last = index == len(storyboard.images) - 1
        if not is_last and panel_count != expected_panels_per_image:
            raise AppError(
                code=COMIC_LLM_SCHEMA_INVALID_ERROR_CODE,
                message=(
                    "non-last storyboard image panel count invalid: "
                    f"image_index={image.image_index}, expected={expected_panels_per_image}, actual={panel_count}"
                ),
                status_code=502,
            )
        if is_last and panel_count > expected_panels_per_image:
            raise AppError(
                code=COMIC_LLM_SCHEMA_INVALID_ERROR_CODE,
                message=(
                    "last storyboard image panel count invalid: "
                    f"image_index={image.image_index}, expected<= {expected_panels_per_image}, actual={panel_count}"
                ),
                status_code=502,
            )


def validate_storyboard_image_count(storyboard: Storyboard, *, expected_image_count: int) -> None:
    image_count = len(storyboard.images)
    if image_count != expected_image_count:
        raise AppError(
            code=COMIC_LLM_SCHEMA_INVALID_ERROR_CODE,
            message=f"storyboard image count mismatch: expected={expected_image_count}, actual={image_count}",
            status_code=502,
        )


def validate_storyboard_character_codes(storyboard: Storyboard, *, bible: CharacterBible) -> None:
    allowed_codes = {character.character_code for character in bible.characters}
    used_codes = sorted({code for image in storyboard.images for panel in image.panels for code in panel.characters if code})
    unknown_codes = [code for code in used_codes if code not in allowed_codes]
    if unknown_codes:
        raise AppError(
            code=COMIC_LLM_SCHEMA_INVALID_ERROR_CODE,
            message=f"unknown storyboard character codes: {', '.join(unknown_codes)}",
            status_code=502,
        )


def build_character_card(*, task: ComicTask, character: dict) -> ComicCharacterCard:
    return ComicCharacterCard(project_id=task.project_id, task_id=task.id, **character)


def build_panel_prompt(*, task: ComicTask, storyboard_id: int, draft) -> ComicPanelPrompt:
    return ComicPanelPrompt(project_id=task.project_id, task_id=task.id, storyboard_id=storyboard_id, image_index=draft.image_index, panel_count=draft.panel_count, character_codes=draft.character_codes, prompt=draft.prompt, negative_prompt=draft.negative_prompt, model_code=draft.model_code, status=PROMPT_READY_STATUS)
