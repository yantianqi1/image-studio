from __future__ import annotations

import json
from collections.abc import Iterable
from dataclasses import dataclass
from io import BytesIO
from pathlib import PurePosixPath
from zipfile import BadZipFile, ZipFile

from sqlalchemy.orm import Session

from apps.api.app.core.errors import AppError
from apps.api.app.domains.comic.character_reference_packs import (
    ALLOWED_IMAGE_SUFFIXES,
    IMAGE_DIR,
    MANIFEST_PATH,
    PACK_SCHEMA_VERSION,
)
from apps.api.app.domains.comic.character_references import character_reference_payload, require_character_cards
from apps.api.app.domains.comic.models import ComicCharacterCard
from apps.api.app.domains.comic.repository import update_character_reference_asset
from apps.api.app.domains.comic.services import require_task
from apps.api.app.domains.image.assets import persist_uploaded_asset
from apps.api.app.domains.llm.service import ensure_storage_dir


@dataclass(frozen=True)
class CharacterImportRecord:
    character_code: str
    name: str
    image_file: str
    content: bytes
    mime_type: str


def import_character_reference_pack(session: Session, *, task_id: str, content: bytes) -> dict:
    task = require_task(session, task_id)
    cards = require_character_cards(session, task_id=task_id)
    records = parse_import_archive(content)
    matched_pairs = match_import_records(cards=cards, records=records)
    asset_ids_by_file: dict[str, int] = {}
    for card, record in matched_pairs:
        asset_id = asset_ids_by_file.get(record.image_file)
        if asset_id is None:
            asset = persist_uploaded_asset(
                session,
                storage_dir=ensure_storage_dir(),
                content=record.content,
                filename=record.image_file,
                mime_type=record.mime_type,
                user_id=task.user_id,
                client_id=task.client_access_id,
            )
            asset_id = asset.id
            asset_ids_by_file[record.image_file] = asset_id
        update_character_reference_asset(session, card=card, asset_id=asset_id)
    session.commit()
    return build_import_payload(session, cards=cards, imported_count=len(matched_pairs))


def parse_import_archive(content: bytes) -> list[CharacterImportRecord]:
    try:
        with ZipFile(BytesIO(content)) as archive:
            names = archive.namelist()
            assert_safe_archive_paths(names)
            manifest = read_manifest(archive, names)
            return read_import_records(archive, manifest)
    except BadZipFile as exc:
        raise AppError(code="comic_character_pack_invalid", message="character reference pack is not a zip", status_code=422) from exc


def assert_safe_archive_paths(names: Iterable[str]) -> None:
    for name in names:
        if not is_safe_pack_path(name):
            raise AppError(code="comic_character_pack_path_invalid", message="character pack path invalid", status_code=422)


def read_manifest(archive: ZipFile, names: list[str]) -> dict:
    if MANIFEST_PATH not in names:
        raise AppError(code="comic_character_pack_manifest_missing", message="characters.json is missing", status_code=422)
    try:
        manifest = json.loads(archive.read(MANIFEST_PATH))
    except json.JSONDecodeError as exc:
        raise AppError(code="comic_character_pack_manifest_invalid", message="characters.json is invalid", status_code=422) from exc
    if not isinstance(manifest, dict):
        raise AppError(code="comic_character_pack_manifest_invalid", message="characters.json must be an object", status_code=422)
    return manifest


def read_import_records(archive: ZipFile, manifest: dict) -> list[CharacterImportRecord]:
    if manifest.get("schema_version") != PACK_SCHEMA_VERSION:
        raise AppError(code="comic_character_pack_schema_unsupported", message="character pack schema unsupported", status_code=422)
    characters = manifest.get("characters")
    if not isinstance(characters, list):
        raise AppError(code="comic_character_pack_manifest_invalid", message="characters must be a list", status_code=422)
    return [read_import_record(archive, item) for item in characters]


def read_import_record(archive: ZipFile, item: object) -> CharacterImportRecord:
    if not isinstance(item, dict):
        raise AppError(code="comic_character_pack_manifest_invalid", message="character entry must be an object", status_code=422)
    image_file = require_manifest_text(item, "image_file")
    assert_safe_image_path(image_file)
    if image_file not in archive.namelist():
        raise AppError(code="comic_character_pack_image_missing", message=f"character image missing: {image_file}", status_code=422)
    return CharacterImportRecord(
        character_code=str(item.get("character_code") or "").strip(),
        name=str(item.get("name") or "").strip(),
        image_file=image_file,
        content=archive.read(image_file),
        mime_type=mime_type_for_image_path(image_file),
    )


def require_manifest_text(item: dict, field_name: str) -> str:
    value = str(item.get(field_name) or "").strip()
    if not value:
        raise AppError(code="comic_character_pack_manifest_invalid", message=f"{field_name} is required", status_code=422)
    return value


def assert_safe_image_path(image_file: str) -> None:
    if not is_safe_pack_path(image_file) or PurePosixPath(image_file).parts[0] != IMAGE_DIR:
        raise AppError(code="comic_character_pack_path_invalid", message="character image path invalid", status_code=422)
    if PurePosixPath(image_file).suffix.lower() not in ALLOWED_IMAGE_SUFFIXES:
        raise AppError(code="comic_character_pack_image_type_invalid", message="character image type invalid", status_code=422)


def is_safe_pack_path(value: str) -> bool:
    if not value or "\\" in value or value.startswith("/"):
        return False
    return all(part not in {"", ".", ".."} for part in PurePosixPath(value).parts)


def mime_type_for_image_path(image_file: str) -> str:
    suffix = PurePosixPath(image_file).suffix.lower()
    if suffix in {".jpg", ".jpeg"}:
        return "image/jpeg"
    if suffix == ".svg":
        return "image/svg+xml"
    if suffix == ".webp":
        return "image/webp"
    if suffix == ".gif":
        return "image/gif"
    return "image/png"


def match_import_records(
    *,
    cards: list[ComicCharacterCard],
    records: list[CharacterImportRecord],
) -> list[tuple[ComicCharacterCard, CharacterImportRecord]]:
    matched_card_ids: set[int] = set()
    pairs: list[tuple[ComicCharacterCard, CharacterImportRecord]] = []
    for record in records:
        card = match_import_record(cards=cards, record=record)
        if card.id in matched_card_ids:
            raise AppError(code="comic_character_pack_character_duplicate", message="character imported more than once", status_code=409)
        matched_card_ids.add(card.id)
        pairs.append((card, record))
    return pairs


def match_import_record(*, cards: list[ComicCharacterCard], record: CharacterImportRecord) -> ComicCharacterCard:
    code_matches = [card for card in cards if record.character_code and card.character_code == record.character_code]
    if len(code_matches) == 1:
        return code_matches[0]
    name_matches = [card for card in cards if record.name and card.name == record.name]
    if len(name_matches) == 1:
        return name_matches[0]
    raise AppError(code="comic_character_pack_character_unmatched", message="character pack entry does not match current task", status_code=409)


def build_import_payload(session: Session, *, cards: list[ComicCharacterCard], imported_count: int) -> dict:
    return {
        "character_count": len(cards),
        "imported_count": imported_count,
        "ready": all(card.reference_asset_id is not None for card in cards),
        "characters": [character_reference_payload(session, card=card) for card in cards],
    }
