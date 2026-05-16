from __future__ import annotations

from sqlalchemy.orm import Session

from apps.api.app.core.errors import AppError
from apps.api.app.domains.character_library.service import (
    CHARACTER_VISIBILITY_PUBLIC,
    get_character_entry,
    normalize_character_name,
    persist_character_asset,
)
from apps.api.app.domains.image.gallery import ASSET_VISIBILITY_PUBLIC, set_asset_visibility
from apps.api.app.infra.storage.asset_storage import AssetStorage


def update_public_character_by_admin(
    session: Session,
    *,
    storage: AssetStorage,
    character_id: int,
    name: str | None,
    content: bytes | None,
    filename: str | None,
    mime_type: str | None,
):
    entry = get_public_character_entry(session, character_id)
    if name is not None:
        entry.name = normalize_character_name(name)
    if content is not None:
        asset = persist_character_asset(
            session,
            storage=storage,
            content=content,
            filename=filename,
            mime_type=mime_type,
            user_id=None,
        )
        set_asset_visibility(asset, ASSET_VISIBILITY_PUBLIC)
        entry.asset_id = asset.id
    session.flush()
    return entry


def get_public_character_entry(session: Session, character_id: int):
    entry = get_character_entry(session, character_id)
    if entry.visibility != CHARACTER_VISIBILITY_PUBLIC:
        raise AppError(code="character_library_not_found", message="character library entry not found", status_code=404)
    return entry
