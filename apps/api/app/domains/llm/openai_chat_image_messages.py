from __future__ import annotations

import base64

from apps.api.app.domains.image.models import Asset
from apps.api.app.infra.storage.asset_storage import AssetStorage


def collect_render_asset_ids(
    *,
    source_asset_id: int | None,
    reference_asset_ids: tuple[int, ...],
    conversation_messages: list[dict] | None,
) -> tuple[int, ...]:
    asset_ids = list(reference_asset_ids or ())
    if source_asset_id is not None:
        asset_ids.append(source_asset_id)
    asset_ids.extend(collect_conversation_asset_ids(conversation_messages))
    return tuple(dict.fromkeys(asset_ids))


def collect_conversation_asset_ids(messages: list[dict] | None) -> list[int]:
    asset_ids: list[int] = []
    for message in messages or []:
        content = message.get("content")
        if not isinstance(content, list):
            continue
        for part in content:
            if isinstance(part, dict) and part.get("type") == "image_asset":
                asset_ids.append(part["asset_id"])
    return asset_ids


def build_chat_image_messages(
    *,
    prompt: str,
    assets: list[Asset],
    storage: AssetStorage,
    conversation_messages: list[dict] | None = None,
) -> list[dict[str, object]]:
    if not assets:
        if not conversation_messages:
            return [{"role": "user", "content": prompt}]
        return build_conversation_messages(
            conversation_messages,
            asset_map={},
            storage=storage,
            prompted_current=prompt,
        )
    if conversation_messages:
        return build_conversation_messages_with_assets(
            conversation_messages,
            assets=assets,
            storage=storage,
            prompted_current=prompt,
        )
    content: list[dict[str, object]] = [{"type": "text", "text": prompt}]
    content.extend(build_image_content(asset, storage=storage) for asset in assets)
    return [{"role": "user", "content": content}]


def build_conversation_messages_with_assets(
    messages: list[dict],
    *,
    assets: list[Asset],
    storage: AssetStorage,
    prompted_current: str,
) -> list[dict[str, object]]:
    referenced_ids = set(collect_conversation_asset_ids(messages))
    asset_map = {asset.id: asset for asset in assets}
    built = build_conversation_messages(
        messages,
        asset_map=asset_map,
        storage=storage,
        prompted_current=prompted_current,
    )
    extra_assets = [asset for asset in assets if asset.id not in referenced_ids]
    return append_assets_to_latest_user_message(built, assets=extra_assets, storage=storage)


def build_conversation_messages(
    messages: list[dict],
    *,
    asset_map: dict[int, Asset],
    storage: AssetStorage,
    prompted_current: str,
) -> list[dict[str, object]]:
    current_index = latest_user_message_index(messages)
    return [
        {
            "role": message["role"],
            "content": build_conversation_content(
                message["content"],
                asset_map=asset_map,
                storage=storage,
                prompted_current=prompted_current if index == current_index else None,
            ),
        }
        for index, message in enumerate(messages)
    ]


def latest_user_message_index(messages: list[dict]) -> int:
    for index in range(len(messages) - 1, -1, -1):
        if messages[index].get("role") == "user":
            return index
    return -1


def build_conversation_content(
    content: object,
    *,
    asset_map: dict[int, Asset],
    storage: AssetStorage,
    prompted_current: str | None,
) -> str | list[dict[str, object]]:
    if isinstance(content, str):
        return prompted_current or content
    parts = build_conversation_parts(content, asset_map=asset_map, storage=storage, prompted_current=prompted_current)
    if any(part.get("type") == "image_url" for part in parts):
        return parts
    return "\n".join(str(part["text"]) for part in parts if part.get("type") == "text")


def build_conversation_parts(
    content: object,
    *,
    asset_map: dict[int, Asset],
    storage: AssetStorage,
    prompted_current: str | None,
) -> list[dict[str, object]]:
    replaced_current = False
    parts: list[dict[str, object]] = []
    for part in content if isinstance(content, list) else []:
        next_part, replaced_current = build_conversation_part(
            part,
            asset_map=asset_map,
            storage=storage,
            prompted_current=prompted_current,
            replaced_current=replaced_current,
        )
        if next_part:
            parts.append(next_part)
    if prompted_current and not replaced_current:
        parts.insert(0, {"type": "text", "text": prompted_current})
    return parts


def build_conversation_part(
    part: object,
    *,
    asset_map: dict[int, Asset],
    storage: AssetStorage,
    prompted_current: str | None,
    replaced_current: bool,
) -> tuple[dict[str, object] | None, bool]:
    if not isinstance(part, dict):
        return None, replaced_current
    if part.get("type") == "text":
        text = prompted_current if prompted_current and not replaced_current else part["text"]
        return {"type": "text", "text": text}, replaced_current or bool(prompted_current)
    if part.get("type") == "image_asset":
        return build_image_content(asset_map[part["asset_id"]], storage=storage), replaced_current
    return None, replaced_current


def append_assets_to_latest_user_message(
    messages: list[dict[str, object]],
    *,
    assets: list[Asset],
    storage: AssetStorage,
) -> list[dict[str, object]]:
    if not assets:
        return messages
    next_messages = list(messages)
    for index in range(len(next_messages) - 1, -1, -1):
        if next_messages[index].get("role") != "user":
            continue
        message = dict(next_messages[index])
        message["content"] = append_assets_to_content(message["content"], assets=assets, storage=storage)
        next_messages[index] = message
        return next_messages
    return next_messages


def append_assets_to_content(content: object, *, assets: list[Asset], storage: AssetStorage) -> list[dict[str, object]]:
    parts = [{"type": "text", "text": content}] if isinstance(content, str) else list(content or [])
    parts.extend(build_image_content(asset, storage=storage) for asset in assets)
    return parts


def build_image_content(asset: Asset, *, storage: AssetStorage) -> dict[str, object]:
    encoded = base64.b64encode(storage.read_bytes(asset.storage_path)).decode("ascii")
    return {"type": "image_url", "image_url": {"url": f"data:{asset.mime_type};base64,{encoded}"}}
