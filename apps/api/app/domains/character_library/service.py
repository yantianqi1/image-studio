from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from apps.api.app.core.errors import AppError
from apps.api.app.domains.auth.ownership import OwnerContext
from apps.api.app.domains.character_library.models import CharacterLibraryEntry
from apps.api.app.domains.image.assets import (
    delete_asset_objects,
    detect_image_mime_type,
    persist_uploaded_asset,
    resolve_asset_public_urls,
)
from apps.api.app.domains.image.gallery import ASSET_VISIBILITY_PUBLIC, set_asset_visibility
from apps.api.app.domains.image.models import Asset, ImageJobReferenceAsset
from apps.api.app.infra.storage.asset_storage import AssetStorage

CHARACTER_VISIBILITY_PRIVATE = "private"
CHARACTER_VISIBILITY_PUBLIC = "public"
MAX_CHARACTER_NAME_LENGTH = 64


@dataclass(frozen=True)
class CharacterReferenceBundle:
    asset_ids: list[int]
    prompt: str


def create_private_character(
    session: Session,
    *,
    storage: AssetStorage,
    user_id: int,
    name: str,
    content: bytes,
    filename: str | None,
    mime_type: str | None,
) -> CharacterLibraryEntry:
    asset = persist_character_asset(
        session,
        storage=storage,
        content=content,
        filename=filename,
        mime_type=mime_type,
        user_id=user_id,
    )
    return create_character_entry(
        session,
        name=name,
        asset_id=asset.id,
        visibility=CHARACTER_VISIBILITY_PRIVATE,
        owner_user_id=user_id,
        created_by_admin_user_id=None,
    )


def create_public_character(
    session: Session,
    *,
    storage: AssetStorage,
    admin_user_id: int,
    name: str,
    content: bytes,
    filename: str | None,
    mime_type: str | None,
) -> CharacterLibraryEntry:
    asset = persist_character_asset(
        session,
        storage=storage,
        content=content,
        filename=filename,
        mime_type=mime_type,
        user_id=None,
    )
    set_asset_visibility(asset, ASSET_VISIBILITY_PUBLIC)
    return create_character_entry(
        session,
        name=name,
        asset_id=asset.id,
        visibility=CHARACTER_VISIBILITY_PUBLIC,
        owner_user_id=None,
        created_by_admin_user_id=admin_user_id,
    )


def persist_character_asset(
    session: Session,
    *,
    storage: AssetStorage,
    content: bytes,
    filename: str | None,
    mime_type: str | None,
    user_id: int | None,
) -> Asset:
    detected_mime = detect_image_mime_type(content)
    if detected_mime is None:
        raise AppError(code="character_image_invalid", message="character image invalid", status_code=422)
    return persist_uploaded_asset(
        session,
        storage=storage,
        content=content,
        filename=filename,
        mime_type=mime_type or detected_mime,
        user_id=user_id,
    )


def create_character_entry(
    session: Session,
    *,
    name: str,
    asset_id: int,
    visibility: str,
    owner_user_id: int | None,
    created_by_admin_user_id: int | None,
) -> CharacterLibraryEntry:
    entry = CharacterLibraryEntry(
        name=normalize_character_name(name),
        asset_id=asset_id,
        visibility=visibility,
        owner_user_id=owner_user_id,
        created_by_admin_user_id=created_by_admin_user_id,
    )
    session.add(entry)
    session.flush()
    return entry


def normalize_character_name(value: str) -> str:
    name = str(value or "").strip()
    if not name:
        raise AppError(code="character_name_required", message="character name required", status_code=422)
    if len(name) > MAX_CHARACTER_NAME_LENGTH:
        raise AppError(code="character_name_too_long", message="character name too long", status_code=422)
    return name


def list_accessible_characters(session: Session, *, owner: OwnerContext) -> list[CharacterLibraryEntry]:
    statement = select(CharacterLibraryEntry)
    if owner.user_id is None:
        statement = statement.where(CharacterLibraryEntry.visibility == CHARACTER_VISIBILITY_PUBLIC)
    else:
        statement = statement.where(
            or_(
                CharacterLibraryEntry.visibility == CHARACTER_VISIBILITY_PUBLIC,
                CharacterLibraryEntry.owner_user_id == owner.user_id,
            )
        )
    return list(session.execute(statement.order_by(CharacterLibraryEntry.created_at.desc())).scalars())


def list_admin_characters(session: Session) -> list[CharacterLibraryEntry]:
    statement = (
        select(CharacterLibraryEntry)
        .where(CharacterLibraryEntry.visibility == CHARACTER_VISIBILITY_PUBLIC)
        .order_by(CharacterLibraryEntry.created_at.desc())
    )
    return list(session.execute(statement).scalars())


def delete_private_character(
    session: Session,
    *,
    storage: AssetStorage,
    character_id: int,
    user_id: int,
) -> None:
    entry = get_character_entry(session, character_id)
    if entry.owner_user_id != user_id:
        raise AppError(code="character_library_not_found", message="character library entry not found", status_code=404)
    delete_character_entry(session, storage=storage, entry=entry)


def delete_public_character_by_admin(
    session: Session,
    *,
    storage: AssetStorage,
    character_id: int,
) -> None:
    entry = get_character_entry(session, character_id)
    if entry.visibility != CHARACTER_VISIBILITY_PUBLIC:
        raise AppError(code="character_library_not_found", message="character library entry not found", status_code=404)
    delete_character_entry(session, storage=storage, entry=entry)


def get_character_entry(session: Session, character_id: int) -> CharacterLibraryEntry:
    entry = session.get(CharacterLibraryEntry, character_id)
    if entry is None:
        raise AppError(code="character_library_not_found", message="character library entry not found", status_code=404)
    return entry


def delete_character_entry(session: Session, *, storage: AssetStorage, entry: CharacterLibraryEntry) -> None:
    asset = session.get(Asset, entry.asset_id)
    if asset is None:
        raise AppError(code="character_asset_missing", message="character asset missing", status_code=500)
    delete_asset_objects(asset, storage)
    delete_character_reference_rows(session, asset_id=asset.id)
    session.delete(entry)
    session.flush()
    session.delete(asset)
    session.flush()


def delete_character_reference_rows(session: Session, *, asset_id: int) -> None:
    rows = list(session.execute(
        select(ImageJobReferenceAsset).where(ImageJobReferenceAsset.asset_id == asset_id)
    ).scalars())
    for row in rows:
        session.delete(row)
    session.flush()


def resolve_character_reference_bundle(
    session: Session,
    *,
    owner: OwnerContext,
    character_ids: list[int],
    prompt: str,
) -> CharacterReferenceBundle:
    ids = ordered_unique_ids(character_ids)
    if not ids:
        return CharacterReferenceBundle(asset_ids=[], prompt=prompt)
    entries = load_accessible_characters_by_id(session, owner=owner, character_ids=ids)
    asset_ids = [entries[character_id].asset_id for character_id in ids]
    names = [entries[character_id].name for character_id in ids]
    return CharacterReferenceBundle(asset_ids=asset_ids, prompt=append_character_prompt(prompt, names))


def ordered_unique_ids(values: list[int]) -> list[int]:
    ids: list[int] = []
    for value in values:
        if value not in ids:
            ids.append(value)
    return ids


def load_accessible_characters_by_id(
    session: Session,
    *,
    owner: OwnerContext,
    character_ids: list[int],
) -> dict[int, CharacterLibraryEntry]:
    accessible = list_accessible_characters(session, owner=owner)
    entries = {entry.id: entry for entry in accessible if entry.id in character_ids}
    if len(entries) != len(character_ids):
        raise AppError(code="character_library_not_found", message="character library entry not found", status_code=404)
    return entries


def append_character_prompt(prompt: str, names: list[str]) -> str:
    character_names = "、".join(names)
    instruction = (
        f"形象库参考：{character_names}。\n"
        "生成画面中的主要人物/形象必须参考随请求发送的形象库图片，保持身份识别、面部特征、发型、体型比例和整体气质一致。\n"
        "不要照抄参考图的姿势、动作、表情、构图或背景；姿势、动作、表情和场景应按用户当前提示词重新创作。\n"
        "如果用户提示词没有明确指定服装，保持参考图中的服装风格和关键服饰一致；如果用户明确指定服装，以用户提示词为准。"
    )
    return f"{prompt.strip()}\n\n{instruction}"


def character_payload(entry: CharacterLibraryEntry, *, storage: AssetStorage, asset: Asset | None) -> dict[str, object]:
    if asset is None:
        raise AppError(code="character_asset_missing", message="character asset missing", status_code=500)
    asset_url, thumbnail_url = resolve_asset_public_urls(asset, storage)
    return {
        "id": entry.id,
        "name": entry.name,
        "asset_id": entry.asset_id,
        "asset_url": asset_url,
        "thumbnail_url": thumbnail_url,
        "visibility": entry.visibility,
        "owner_user_id": entry.owner_user_id,
        "created_at": entry.created_at.isoformat(),
    }


def admin_character_payload(entry: CharacterLibraryEntry, *, asset: Asset | None) -> dict[str, object]:
    if asset is None:
        raise AppError(code="character_asset_missing", message="character asset missing", status_code=500)
    asset_url = f"/api/admin/image/assets/{asset.id}"
    return {
        "id": entry.id,
        "name": entry.name,
        "asset_id": entry.asset_id,
        "asset_url": asset_url,
        "thumbnail_url": asset_url,
        "visibility": entry.visibility,
        "owner_user_id": entry.owner_user_id,
        "created_at": entry.created_at.isoformat(),
    }
