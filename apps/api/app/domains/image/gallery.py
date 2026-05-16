from __future__ import annotations

from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from apps.api.app.core.errors import AppError
from apps.api.app.domains.auth.models import User
from apps.api.app.domains.auth.ownership import OwnerContext
from apps.api.app.domains.image.models import Asset, ImageAssetTag, ImageJob, ImageJobResult
from apps.api.app.domains.image.repository import asset_access_allowed, get_asset
from apps.api.app.domains.image.tagging import delete_asset_tagging_state, normalize_gallery_tag

ASSET_VISIBILITY_PRIVATE = "private"
ASSET_VISIBILITY_PUBLIC = "public"
GALLERY_SCOPE_MINE = "mine"
GALLERY_SCOPE_PUBLIC = "public"


def normalize_asset_visibility(value: str) -> str:
    normalized = str(value or "").strip() or ASSET_VISIBILITY_PRIVATE
    if normalized in {ASSET_VISIBILITY_PRIVATE, ASSET_VISIBILITY_PUBLIC}:
        return normalized
    raise AppError(code="asset_visibility_invalid", message="asset visibility invalid", status_code=422)


def set_asset_visibility(asset: Asset, visibility: str) -> None:
    normalized = normalize_asset_visibility(visibility)
    asset.visibility = normalized
    asset.published_at = datetime.utcnow() if normalized == ASSET_VISIBILITY_PUBLIC else None


def get_asset_for_read(session: Session, asset_id: int, owner: OwnerContext) -> Asset:
    asset = get_asset(session, asset_id)
    if asset.visibility == ASSET_VISIBILITY_PUBLIC or asset_access_allowed(asset, owner=owner):
        return asset
    raise AppError(code="asset_not_found", message="asset not found", status_code=404)


def update_owned_asset_visibility(session: Session, *, asset_id: int, owner: OwnerContext, visibility: str) -> Asset:
    asset = get_asset(session, asset_id)
    if not asset_access_allowed(asset, owner=owner):
        raise AppError(code="asset_not_found", message="asset not found", status_code=404)
    set_asset_visibility(asset, visibility)
    session.flush()
    return asset


def list_gallery_items(
    session: Session,
    *,
    owner: OwnerContext,
    scope: str,
    tag: str | None = None,
) -> list[tuple[ImageJobResult, ImageJob, Asset]]:
    normalized_scope = normalize_gallery_scope(scope)
    normalized_tag = normalize_gallery_tag(tag) if tag else ""
    statement = (
        select(ImageJobResult, ImageJob, Asset)
        .join(ImageJob, ImageJob.id == ImageJobResult.job_id)
        .join(Asset, Asset.id == ImageJobResult.asset_id)
        .order_by(Asset.created_at.desc(), ImageJobResult.id.desc())
    )
    if normalized_scope == GALLERY_SCOPE_PUBLIC:
        statement = statement.where(Asset.visibility == ASSET_VISIBILITY_PUBLIC)
        statement = statement.outerjoin(User, User.id == Asset.owner_user_id).where(
            (Asset.owner_user_id.is_(None)) | (User.status == "active")
        )
    elif owner.user_id is not None:
        statement = statement.where(Asset.owner_user_id == owner.user_id)
    elif owner.anonymous_session_id is not None:
        statement = statement.where(Asset.owner_anonymous_session_id == owner.anonymous_session_id)
    else:
        return []
    if normalized_tag:
        statement = statement.join(ImageAssetTag, ImageAssetTag.asset_id == Asset.id).where(ImageAssetTag.normalized_tag == normalized_tag)
    return list(session.execute(statement).all())


def normalize_gallery_scope(value: str) -> str:
    normalized = str(value or "").strip() or GALLERY_SCOPE_MINE
    if normalized in {GALLERY_SCOPE_MINE, GALLERY_SCOPE_PUBLIC}:
        return normalized
    raise AppError(code="image_gallery_scope_invalid", message="image gallery scope invalid", status_code=422)


def delete_owned_asset(session: Session, *, asset_id: int, owner: OwnerContext) -> None:
    from apps.api.app.domains.image.asset_deletion import delete_asset_objects
    from apps.api.app.infra.storage.factory import build_asset_storage

    asset = get_asset(session, asset_id)
    if not asset_access_allowed(asset, owner=owner):
        raise AppError(code="asset_not_found", message="asset not found", status_code=404)
    _remove_asset_and_references(session, asset)


def delete_asset_by_admin(session: Session, *, asset_id: int) -> None:
    asset = get_asset(session, asset_id)
    _remove_asset_and_references(session, asset)


def _remove_asset_and_references(session: Session, asset: Asset) -> None:
    from apps.api.app.domains.image.asset_deletion import delete_asset_objects
    from apps.api.app.infra.storage.factory import build_asset_storage

    results = list(session.execute(
        select(ImageJobResult).where(ImageJobResult.asset_id == asset.id)
    ).scalars())
    for result in results:
        session.delete(result)
    session.flush()
    delete_asset_tagging_state(session, asset_ids=[asset.id])
    storage = build_asset_storage()
    delete_asset_objects(asset, storage)
    session.delete(asset)
    session.flush()


def list_admin_gallery_items(
    session: Session,
    *,
    page: int = 1,
    page_size: int = 50,
    query: str | None = None,
) -> tuple[list[tuple[ImageJobResult, ImageJob, Asset]], int]:
    base_filter = Asset.visibility == ASSET_VISIBILITY_PUBLIC
    statement = (
        select(ImageJobResult, ImageJob, Asset)
        .join(ImageJob, ImageJob.id == ImageJobResult.job_id)
        .join(Asset, Asset.id == ImageJobResult.asset_id)
        .where(base_filter)
        .order_by(Asset.published_at.desc(), Asset.id.desc())
    )
    count_stmt = (
        select(func.count())
        .select_from(ImageJobResult)
        .join(Asset, Asset.id == ImageJobResult.asset_id)
        .where(base_filter)
    )
    if query:
        statement = statement.where(ImageJob.prompt.ilike(f"%{query}%"))
        count_stmt = count_stmt.join(ImageJob, ImageJob.id == ImageJobResult.job_id).where(ImageJob.prompt.ilike(f"%{query}%"))

    total = session.execute(count_stmt).scalar() or 0
    offset = (page - 1) * page_size
    statement = statement.offset(offset).limit(page_size)
    items = list(session.execute(statement).all())
    return items, total


def load_assets_by_id(session: Session, asset_ids: list[int]) -> dict[int, Asset]:
    if not asset_ids:
        return {}
    statement = select(Asset).where(Asset.id.in_(asset_ids))
    return {asset.id: asset for asset in session.execute(statement).scalars()}
