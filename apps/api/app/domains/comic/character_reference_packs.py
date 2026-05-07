from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime
from io import BytesIO
from pathlib import PurePosixPath
from zipfile import ZIP_DEFLATED, ZipFile

from sqlalchemy.orm import Session

from apps.api.app.core.errors import AppError
from apps.api.app.domains.auth.ownership import OwnerContext
from apps.api.app.domains.comic.character_references import (
    COMIC_REFERENCES_NOT_READY_CODE,
    require_character_cards,
)
from apps.api.app.domains.comic.models import ComicCharacterCard, ComicTask
from apps.api.app.domains.comic.ownership import require_task_for_owner
from apps.api.app.domains.image.models import Asset
from apps.api.app.domains.image.service import get_asset_for_owner
from apps.api.app.infra.storage.asset_storage import AssetStorage
from apps.api.app.infra.storage.factory import build_asset_storage

PACK_SCHEMA_VERSION = 1
MANIFEST_PATH = "characters.json"
IMAGE_DIR = "images"
ZIP_MEDIA_TYPE = "application/zip"
MAX_FILENAME_STEM_LENGTH = 80
ALLOWED_IMAGE_SUFFIXES = {".gif", ".jpeg", ".jpg", ".png", ".svg", ".webp"}
IMAGE_MIME_SUFFIXES = {"image/gif": ".gif", "image/jpeg": ".jpg", "image/png": ".png", "image/svg+xml": ".svg", "image/webp": ".webp"}


@dataclass(frozen=True)
class CharacterPackEntry:
    card: ComicCharacterCard
    asset: Asset
    image_file: str
    content: bytes


def export_character_reference_pack(session: Session, task_id: str, *, owner: OwnerContext) -> tuple[bytes, str]:
    task = require_task_for_owner(session, task_id, owner)
    cards = require_ready_character_cards(session, task_id=task_id, owner=owner)
    storage = build_asset_storage()
    entries = build_pack_entries(session, cards=cards, owner=owner, storage=storage)
    manifest = build_manifest(task=task, entries=entries)
    archive_name = build_archive_name(task)
    return write_archive(manifest=manifest, entries=entries), archive_name


def require_ready_character_cards(
    session: Session,
    *,
    task_id: str,
    owner: OwnerContext,
) -> list[ComicCharacterCard]:
    cards = require_character_cards(session, task_id=task_id, owner=owner)
    if any(card.reference_asset_id is None for card in cards):
        raise AppError(
            code=COMIC_REFERENCES_NOT_READY_CODE,
            message="comic character references are not ready",
            status_code=409,
        )
    return cards


def build_pack_entries(
    session: Session,
    *,
    cards: list[ComicCharacterCard],
    owner: OwnerContext,
    storage: AssetStorage,
) -> list[CharacterPackEntry]:
    seen: dict[str, int] = {}
    filenames_by_asset: dict[int, str] = {}
    entries: list[CharacterPackEntry] = []
    for card in cards:
        asset = get_asset_for_owner(session, int(card.reference_asset_id or 0), owner)
        assert_exportable_asset_file(asset, storage=storage)
        image_file = filenames_by_asset.get(asset.id)
        if image_file is None:
            image_file = build_image_filename(card_name=card.name, asset=asset, seen=seen)
            filenames_by_asset[asset.id] = image_file
        entries.append(CharacterPackEntry(card=card, asset=asset, image_file=image_file, content=storage.read_bytes(asset.storage_path)))
    return entries


def build_image_filename(*, card_name: str, asset: Asset, seen: dict[str, int]) -> str:
    stem = sanitize_filename_stem(card_name)
    count = seen.get(stem, 0) + 1
    seen[stem] = count
    suffix = "" if count == 1 else f"-{count}"
    return f"{IMAGE_DIR}/{stem}{suffix}{resolve_asset_image_suffix(asset)}"


def sanitize_filename_stem(value: str) -> str:
    chars = [char if is_filename_char(char) else "-" for char in value.strip()]
    stem = "-".join(part for part in "".join(chars).split("-") if part)
    return (stem or "character")[:MAX_FILENAME_STEM_LENGTH]


def is_filename_char(char: str) -> bool:
    return char.isalnum() or char in {"_", "-"}


def assert_exportable_asset_file(asset: Asset, *, storage: AssetStorage) -> None:
    if not storage.exists(asset.storage_path):
        raise AppError(code="comic_character_reference_asset_missing", message="reference asset file missing", status_code=409)
    resolve_asset_image_suffix(asset)


def resolve_asset_image_suffix(asset: Asset) -> str:
    mime_type = normalize_asset_mime_type(asset.mime_type)
    if mime_type in IMAGE_MIME_SUFFIXES:
        return IMAGE_MIME_SUFFIXES[mime_type]
    suffix = PurePosixPath(asset.storage_path).suffix.lower()
    if mime_type.startswith("image/") and suffix in ALLOWED_IMAGE_SUFFIXES:
        return suffix
    raise AppError(code="comic_character_reference_asset_type_invalid", message="reference asset type invalid", status_code=409)


def normalize_asset_mime_type(mime_type: str) -> str:
    return str(mime_type or "").split(";", 1)[0].strip().lower()


def build_manifest(*, task: ComicTask, entries: list[CharacterPackEntry]) -> dict:
    return {
        "schema_version": PACK_SCHEMA_VERSION,
        "exported_at": datetime.utcnow().isoformat(),
        "source_task_id": task.id,
        "characters": [build_character_manifest_item(entry) for entry in entries],
    }


def build_character_manifest_item(entry: CharacterPackEntry) -> dict:
    card = entry.card
    return {
        "character_code": card.character_code,
        "name": card.name,
        "role_in_story": card.role_in_story,
        "personality": card.personality,
        "appearance": card.appearance,
        "costume": card.costume,
        "color_palette": card.color_palette,
        "must_keep_prompt": card.must_keep_prompt,
        "negative_prompt": card.negative_prompt,
        "multi_view_prompt": card.multi_view_prompt,
        "image_file": entry.image_file,
        "source_asset_id": entry.asset.id,
    }


def write_archive(*, manifest: dict, entries: list[CharacterPackEntry]) -> bytes:
    buffer = BytesIO()
    written_files: set[str] = set()
    with ZipFile(buffer, "w", ZIP_DEFLATED) as archive:
        archive.writestr(MANIFEST_PATH, json.dumps(manifest, ensure_ascii=False, sort_keys=True))
        for entry in entries:
            if entry.image_file in written_files:
                continue
            archive.writestr(entry.image_file, entry.content)
            written_files.add(entry.image_file)
    return buffer.getvalue()


def build_archive_name(task: ComicTask) -> str:
    safe_task_id = sanitize_filename_stem(task.id)
    return f"comic-character-references-{safe_task_id}.zip"
