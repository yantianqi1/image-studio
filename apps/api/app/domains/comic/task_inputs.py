from __future__ import annotations

from typing import Any

from apps.api.app.domains.comic.style_presets import normalize_style_preset_id


def normalize_comic_task_input_payload(input_payload: dict[str, Any]) -> dict[str, Any]:
    normalized_payload = dict(input_payload)
    normalized_payload["style_preset"] = normalize_style_preset_id(normalized_payload.get("style_preset"))
    return normalized_payload
