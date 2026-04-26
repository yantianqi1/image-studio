from __future__ import annotations

from concurrent.futures import Future, ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from typing import Any, Callable

from apps.api.app.core.errors import AppError
from apps.api.app.domains.comic.structured_outputs import CharacterBible, Storyboard, StoryboardImage

COMIC_LLM_SCHEMA_INVALID_ERROR_CODE = "comic_llm_schema_invalid"
STORYBOARD_GENERATION_CONCURRENCY = 3
SINGLE_SEGMENT_IMAGE_COUNT = 1

StoryboardCaller = Callable[[dict], Storyboard]


@dataclass(frozen=True)
class StoryboardGenerationContext:
    analysis_payload: dict[str, Any]
    character_bible_payload: dict[str, Any]
    style_preset: str
    panels_per_image: int
    target_image_count: int
    story_segments: tuple[dict[str, Any], ...]


def build_storyboard_generation_context(*, inputs, analysis, bible: CharacterBible) -> StoryboardGenerationContext:
    return StoryboardGenerationContext(
        analysis_payload=serialize_analysis(analysis),
        character_bible_payload=bible.model_dump(),
        style_preset=inputs.style_preset,
        panels_per_image=inputs.panels_per_image,
        target_image_count=inputs.target_image_count,
        story_segments=tuple(inputs.story_segments),
    )


def generate_storyboard_pages(*, context: StoryboardGenerationContext, call_storyboard_llm: StoryboardCaller) -> Storyboard:
    if context.target_image_count != len(context.story_segments):
        raise AppError(code=COMIC_LLM_SCHEMA_INVALID_ERROR_CODE, message="story segment count mismatch", status_code=502)
    segment_boards = run_segment_storyboard_calls(context=context, call_storyboard_llm=call_storyboard_llm)
    return merge_segment_storyboards(context=context, segment_boards=segment_boards)


def run_segment_storyboard_calls(*, context: StoryboardGenerationContext, call_storyboard_llm: StoryboardCaller) -> dict[int, Storyboard]:
    if len(context.story_segments) == SINGLE_SEGMENT_IMAGE_COUNT:
        segment = context.story_segments[0]
        return {read_segment_index(segment): call_storyboard_llm(build_segment_storyboard_input(context=context, segment=segment))}
    return run_concurrent_segment_storyboard_calls(context=context, call_storyboard_llm=call_storyboard_llm)


def run_concurrent_segment_storyboard_calls(*, context: StoryboardGenerationContext, call_storyboard_llm: StoryboardCaller) -> dict[int, Storyboard]:
    segment_boards: dict[int, Storyboard] = {}
    with ThreadPoolExecutor(max_workers=STORYBOARD_GENERATION_CONCURRENCY) as executor:
        futures = submit_segment_storyboard_calls(executor=executor, context=context, call_storyboard_llm=call_storyboard_llm)
        for future in as_completed(futures):
            segment_boards[futures[future]] = future.result()
    return segment_boards


def submit_segment_storyboard_calls(
    *,
    executor: ThreadPoolExecutor,
    context: StoryboardGenerationContext,
    call_storyboard_llm: StoryboardCaller,
) -> dict[Future[Storyboard], int]:
    futures: dict[Future[Storyboard], int] = {}
    for segment in context.story_segments:
        segment_index = read_segment_index(segment)
        payload = build_segment_storyboard_input(context=context, segment=segment)
        futures[executor.submit(call_storyboard_llm, payload)] = segment_index
    return futures


def merge_segment_storyboards(*, context: StoryboardGenerationContext, segment_boards: dict[int, Storyboard]) -> Storyboard:
    images = [
        extract_segment_image(segment_boards[read_segment_index(segment)], context=context, segment=segment)
        for segment in context.story_segments
    ]
    return Storyboard(style_preset=context.style_preset, panels_per_image=context.panels_per_image, images=images)


def extract_segment_image(storyboard: Storyboard, *, context: StoryboardGenerationContext, segment: dict[str, Any]) -> StoryboardImage:
    validate_segment_storyboard_metadata(storyboard=storyboard, context=context)
    if len(storyboard.images) == SINGLE_SEGMENT_IMAGE_COUNT:
        return storyboard.images[0]
    segment_index = read_segment_index(segment)
    raise AppError(
        code=COMIC_LLM_SCHEMA_INVALID_ERROR_CODE,
        message=f"segment storyboard image count mismatch: segment_index={segment_index}, actual={len(storyboard.images)}",
        status_code=502,
    )


def validate_segment_storyboard_metadata(*, storyboard: Storyboard, context: StoryboardGenerationContext) -> None:
    if storyboard.panels_per_image != context.panels_per_image:
        raise AppError(
            code=COMIC_LLM_SCHEMA_INVALID_ERROR_CODE,
            message=(
                "storyboard panels_per_image mismatch: "
                f"expected={context.panels_per_image}, actual={storyboard.panels_per_image}"
            ),
            status_code=502,
        )
    if storyboard.style_preset == context.style_preset:
        return
    raise AppError(
        code=COMIC_LLM_SCHEMA_INVALID_ERROR_CODE,
        message=f"storyboard style_preset mismatch: expected={context.style_preset}, actual={storyboard.style_preset}",
        status_code=502,
    )


def build_segment_storyboard_input(*, context: StoryboardGenerationContext, segment: dict[str, Any]) -> dict:
    return build_storyboard_payload(
        analysis_payload=context.analysis_payload,
        character_bible_payload=context.character_bible_payload,
        style_preset=context.style_preset,
        panels_per_image=context.panels_per_image,
        target_image_count=SINGLE_SEGMENT_IMAGE_COUNT,
        story_segments=[segment],
    )


def build_storyboard_input(*, inputs, analysis, bible: CharacterBible) -> dict:
    return build_storyboard_payload(
        analysis_payload=serialize_analysis(analysis),
        character_bible_payload=bible.model_dump(),
        style_preset=inputs.style_preset,
        panels_per_image=inputs.panels_per_image,
        target_image_count=inputs.target_image_count,
        story_segments=inputs.story_segments,
    )


def build_storyboard_payload(
    *,
    analysis_payload: dict[str, Any],
    character_bible_payload: dict[str, Any],
    style_preset: str,
    panels_per_image: int,
    target_image_count: int,
    story_segments,
) -> dict:
    return {
        "story_analysis": analysis_payload,
        "character_bible": character_bible_payload,
        "style_preset": style_preset,
        "panels_per_image": panels_per_image,
        "target_image_count": target_image_count,
        "story_segments": story_segments,
        "storyboard_requirements": build_storyboard_requirements(),
    }


def build_storyboard_requirements() -> list[str]:
    return [
        "每个 story_segments 条目必须生成 exactly 1 张漫画图片，并且 images 数组长度必须等于 target_image_count。",
        "每张漫画图片必须覆盖对应 source_text 的完整剧情容量，不要只画开头或摘要。",
        "panel dialogue、caption、sign、SFX 如需出现文字，必须使用简体中文，不允许英文可见文字。",
    ]


def validate_storyboard_image_indexes(storyboard: Storyboard, *, expected_indexes: list[int]) -> None:
    actual_indexes = [image.image_index for image in storyboard.images]
    if actual_indexes == expected_indexes:
        return
    raise AppError(
        code=COMIC_LLM_SCHEMA_INVALID_ERROR_CODE,
        message=f"storyboard image indexes mismatch: expected={expected_indexes}, actual={actual_indexes}",
        status_code=502,
    )


def read_segment_index(segment: dict[str, Any]) -> int:
    return int(segment["segment_index"])


def serialize_analysis(analysis) -> dict[str, Any]:
    return {"title_suggestion": analysis.title_suggestion, "genre": analysis.genre, "tone": analysis.tone, "plot_summary": analysis.plot_summary, "world_setting": analysis.world_setting, "main_conflict": analysis.main_conflict, "narrative_beats": analysis.narrative_beats, "key_conflicts": analysis.key_conflicts, "visual_motifs": analysis.visual_motifs, "missing_information": analysis.missing_information}
