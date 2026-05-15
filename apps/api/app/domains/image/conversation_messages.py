from __future__ import annotations

from sqlalchemy.orm import Session

from apps.api.app.core.errors import AppError
from apps.api.app.domains.auth.ownership import OwnerContext
from apps.api.app.domains.image.repository import get_asset_for_owner

CONVERSATION_MESSAGE_ROLES = frozenset({"system", "user", "assistant"})
CONVERSATION_PART_TYPES = frozenset({"text", "image_asset"})


def normalize_conversation_messages(messages: list[dict] | None) -> list[dict] | None:
    if not messages:
        return None
    return [normalize_conversation_message(message) for message in messages]


def normalize_conversation_message(message: dict) -> dict:
    if not isinstance(message, dict):
        raise AppError(code="conversation_message_invalid", message="conversation message invalid", status_code=422)
    role = str(message.get("role") or "").strip().lower()
    if role not in CONVERSATION_MESSAGE_ROLES:
        raise AppError(code="conversation_message_role_invalid", message="conversation message role invalid", status_code=422)
    return {"role": role, "content": normalize_conversation_content(message.get("content"))}


def normalize_conversation_content(content: object) -> str | list[dict]:
    if isinstance(content, str):
        text = content.strip()
        if text:
            return text
    if isinstance(content, list):
        parts = [normalize_conversation_part(part) for part in content]
        if parts:
            return parts
    raise AppError(code="conversation_message_content_invalid", message="conversation message content invalid", status_code=422)


def normalize_conversation_part(part: object) -> dict:
    if not isinstance(part, dict):
        raise AppError(code="conversation_message_part_invalid", message="conversation message part invalid", status_code=422)
    part_type = str(part.get("type") or "").strip()
    if part_type not in CONVERSATION_PART_TYPES:
        raise AppError(code="conversation_message_part_type_invalid", message="conversation message part type invalid", status_code=422)
    if part_type == "text":
        return normalize_text_part(part)
    return normalize_image_asset_part(part)


def normalize_text_part(part: dict) -> dict:
    text = str(part.get("text") or "").strip()
    if not text:
        raise AppError(code="conversation_message_text_required", message="conversation message text required", status_code=422)
    return {"type": "text", "text": text}


def normalize_image_asset_part(part: dict) -> dict:
    asset_id = part.get("asset_id")
    if not isinstance(asset_id, int) or isinstance(asset_id, bool) or asset_id < 1:
        raise AppError(code="conversation_message_asset_required", message="conversation message asset required", status_code=422)
    return {"type": "image_asset", "asset_id": asset_id}


def validate_conversation_message_assets(session: Session, *, messages: list[dict] | None, owner: OwnerContext) -> None:
    for asset_id in collect_conversation_asset_ids(messages):
        get_asset_for_owner(session, asset_id, owner)


def collect_conversation_asset_ids(messages: list[dict] | None) -> list[int]:
    asset_ids: list[int] = []
    for message in messages or []:
        content = message.get("content")
        if not isinstance(content, list):
            continue
        for part in content:
            if part.get("type") == "image_asset":
                asset_ids.append(part["asset_id"])
    return asset_ids
