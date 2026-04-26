from __future__ import annotations

import math
import re
from typing import Any

from apps.api.app.core.errors import AppError

TARGET_SEGMENT_CHAR_COUNT = 900


def parse_target_image_count(raw_value: Any, *, source_text: str) -> int:
    if raw_value in (None, "", "auto"):
        return estimate_target_image_count(source_text)
    target_image_count = int(raw_value)
    if target_image_count < 1:
        raise AppError(code="comic_target_image_count_invalid", message="comic target_image_count must be at least 1", status_code=422)
    return target_image_count


def estimate_target_image_count(source_text: str) -> int:
    return max(1, math.ceil(len(source_text) / TARGET_SEGMENT_CHAR_COUNT))


def build_story_segments(source_text: str, *, target_image_count: int) -> list[dict[str, Any]]:
    text_units = split_story_units(source_text)
    segment_texts = merge_units_into_segments(text_units, target_count=target_image_count)
    return [build_story_segment(index=index, text=segment) for index, segment in enumerate(segment_texts, start=1)]


def split_story_units(source_text: str) -> list[str]:
    paragraphs = [item.strip() for item in source_text.replace("\r\n", "\n").split("\n") if item.strip()]
    units = paragraphs if len(paragraphs) > 1 else split_sentences(source_text)
    return [chunk for unit in units for chunk in split_oversized_unit(unit)]


def split_sentences(source_text: str) -> list[str]:
    sentences = re.split(r"(?<=[。！？!?；;])", source_text.strip())
    return [sentence.strip() for sentence in sentences if sentence.strip()]


def split_oversized_unit(unit: str) -> list[str]:
    if len(unit) <= TARGET_SEGMENT_CHAR_COUNT:
        return [unit]
    return [unit[index:index + TARGET_SEGMENT_CHAR_COUNT].strip() for index in range(0, len(unit), TARGET_SEGMENT_CHAR_COUNT) if unit[index:index + TARGET_SEGMENT_CHAR_COUNT].strip()]


def merge_units_into_segments(units: list[str], *, target_count: int) -> list[str]:
    if target_count == 1:
        return ["\n".join(units)]
    target_length = max(1, math.ceil(sum(len(unit) for unit in units) / target_count))
    segments = merge_units_by_budget(units, target_length=target_length)
    return rebalance_segments(segments, target_count=target_count)


def merge_units_by_budget(units: list[str], *, target_length: int) -> list[str]:
    segments: list[str] = []
    current: list[str] = []
    current_length = 0
    for unit in units:
        if current and current_length + len(unit) > target_length:
            segments.append("\n".join(current))
            current = []
            current_length = 0
        current.append(unit)
        current_length += len(unit)
    if current:
        segments.append("\n".join(current))
    return segments


def rebalance_segments(segments: list[str], *, target_count: int) -> list[str]:
    while len(segments) > target_count:
        tail = segments.pop()
        segments[-1] = f"{segments[-1]}\n{tail}"
    while len(segments) < target_count:
        segments.append(split_largest_segment(segments))
    return segments


def split_largest_segment(segments: list[str]) -> str:
    largest_index = max(range(len(segments)), key=lambda index: len(segments[index]))
    segment = segments[largest_index]
    midpoint = max(1, len(segment) // 2)
    segments[largest_index] = segment[:midpoint].strip()
    return segment[midpoint:].strip()


def build_story_segment(*, index: int, text: str) -> dict[str, Any]:
    return {"segment_index": index, "source_text": text, "storyboard_goal": "one complete comic page with coherent beginning, middle, and ending beats"}
