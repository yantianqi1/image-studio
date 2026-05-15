from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, Request, UploadFile, status
from sqlalchemy.orm import Session

from apps.api.app.core.config import get_settings
from apps.api.app.core.deps import get_db_session
from apps.api.app.core.response import api_ok
from apps.api.app.domains.auth.ownership import resolve_request_owner
from apps.api.app.domains.auth.service import get_user_by_token, require_admin
from apps.api.app.domains.character_library.service import (
    character_payload,
    create_private_character,
    create_public_character,
    list_accessible_characters,
    list_admin_characters,
)
from apps.api.app.domains.image.gallery import load_assets_by_id
from apps.api.app.domains.settings.service import require_uploads_enabled
from apps.api.app.infra.storage.factory import build_asset_storage

public_router = APIRouter(prefix="/character-library", tags=["character-library-public"])
admin_router = APIRouter(prefix="/character-library", tags=["character-library-admin"])


@public_router.get("")
def get_character_library(request: Request, session: Session = Depends(get_db_session)):
    owner = resolve_request_owner(request, session)
    entries = list_accessible_characters(session, owner=owner)
    return api_ok(character_list_payload(session, entries))


@public_router.post("", status_code=status.HTTP_201_CREATED)
async def create_my_character(
    request: Request,
    name: str = Form(...),
    file: UploadFile = File(...),
    session: Session = Depends(get_db_session),
):
    require_uploads_enabled(session)
    user = get_user_by_token(session, request.cookies.get(get_settings().user_session_cookie_name))
    entry = create_private_character(
        session,
        storage=build_asset_storage(),
        user_id=user.id,
        name=name,
        content=await file.read(),
        filename=file.filename,
        mime_type=file.content_type,
    )
    session.commit()
    return api_ok(character_list_payload(session, [entry])[0])


@admin_router.get("")
def get_admin_character_library(request: Request, session: Session = Depends(get_db_session)):
    require_admin(request, session)
    entries = list_admin_characters(session)
    return api_ok(character_list_payload(session, entries))


@admin_router.post("", status_code=status.HTTP_201_CREATED)
async def create_admin_character(
    request: Request,
    name: str = Form(...),
    file: UploadFile = File(...),
    session: Session = Depends(get_db_session),
):
    admin = require_admin(request, session)
    entry = create_public_character(
        session,
        storage=build_asset_storage(),
        admin_user_id=admin.id,
        name=name,
        content=await file.read(),
        filename=file.filename,
        mime_type=file.content_type,
    )
    session.commit()
    return api_ok(character_list_payload(session, [entry])[0])


def character_list_payload(session: Session, entries) -> list[dict[str, object]]:
    storage = build_asset_storage()
    assets = load_assets_by_id(session, [entry.asset_id for entry in entries])
    return [character_payload(entry, storage=storage, asset=assets.get(entry.asset_id)) for entry in entries]
