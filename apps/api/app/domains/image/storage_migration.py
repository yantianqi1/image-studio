from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.domains.image.models import Asset
from apps.api.app.infra.storage.asset_storage import AssetStorage


class AssetStorageMigrationError(RuntimeError):
    pass


@dataclass(frozen=True)
class AssetStorageMigrationResult:
    migrated_count: int


def migrate_local_assets_to_storage(
    session: Session,
    *,
    source_root: Path,
    target_storage: AssetStorage,
) -> AssetStorageMigrationResult:
    migrated_count = 0
    for asset in list_assets_for_migration(session):
        local_path = resolve_local_asset_path(asset.storage_path)
        key = resolve_asset_key(local_path=local_path, source_root=source_root)
        target_storage.write_bytes(key, read_required_file(local_path), asset.mime_type)
        asset.storage_path = key
        migrated_count += 1
    session.flush()
    return AssetStorageMigrationResult(migrated_count=migrated_count)


def list_assets_for_migration(session: Session) -> list[Asset]:
    return list(session.execute(select(Asset).order_by(Asset.id.asc())).scalars())


def resolve_local_asset_path(storage_path: str) -> Path:
    path = Path(storage_path)
    if path.is_absolute():
        return path
    return path.resolve()


def resolve_asset_key(*, local_path: Path, source_root: Path) -> str:
    try:
        return local_path.relative_to(source_root.resolve()).as_posix()
    except ValueError as error:
        raise AssetStorageMigrationError(f"asset file outside source root: {local_path}") from error


def read_required_file(path: Path) -> bytes:
    if not path.is_file():
        raise AssetStorageMigrationError(f"asset file missing: {path}")
    return path.read_bytes()
