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


@dataclass(frozen=True)
class AssetStorageMigrationItem:
    asset_id: int
    source_path: Path
    key: str
    mime_type: str
    current_storage_path: str


def migrate_local_assets_to_storage(
    session: Session,
    *,
    source_root: Path,
    target_storage: AssetStorage,
) -> AssetStorageMigrationResult:
    items = plan_local_assets_to_storage(session, source_root=source_root)
    assets_by_id = {asset.id: asset for asset in list_assets_for_migration(session)}
    for item in items:
        target_storage.write_bytes(item.key, read_required_file(item.source_path), item.mime_type)
        assets_by_id[item.asset_id].storage_path = item.key
    session.flush()
    return AssetStorageMigrationResult(migrated_count=len(items))


def plan_local_assets_to_storage(
    session: Session,
    *,
    source_root: Path,
) -> tuple[AssetStorageMigrationItem, ...]:
    return tuple(build_migration_item(asset, source_root=source_root) for asset in list_assets_for_migration(session))


def list_assets_for_migration(session: Session) -> list[Asset]:
    return list(session.execute(select(Asset).order_by(Asset.id.asc())).scalars())


def build_migration_item(asset: Asset, *, source_root: Path) -> AssetStorageMigrationItem:
    local_path = resolve_local_asset_path(asset.storage_path, source_root=source_root)
    return AssetStorageMigrationItem(
        asset_id=asset.id,
        source_path=local_path,
        key=resolve_asset_key(local_path=local_path, source_root=source_root),
        mime_type=asset.mime_type,
        current_storage_path=asset.storage_path,
    )


def resolve_local_asset_path(storage_path: str, *, source_root: Path) -> Path:
    candidates = existing_candidate_paths(storage_path, source_root=source_root)
    if len(candidates) == 1:
        return candidates[0]
    if len(candidates) > 1:
        joined = ", ".join(str(path) for path in candidates)
        raise AssetStorageMigrationError(f"asset file path ambiguous: {joined}")
    return missing_candidate_path(storage_path, source_root=source_root)


def existing_candidate_paths(storage_path: str, *, source_root: Path) -> tuple[Path, ...]:
    candidates = unique_paths(candidate_paths(storage_path, source_root=source_root))
    return tuple(path for path in candidates if path.is_file())


def candidate_paths(storage_path: str, *, source_root: Path) -> tuple[Path, ...]:
    path = Path(storage_path)
    if path.is_absolute():
        return (path,)
    return (source_root / path, path.resolve())


def unique_paths(paths: tuple[Path, ...]) -> tuple[Path, ...]:
    seen: set[Path] = set()
    unique: list[Path] = []
    for path in paths:
        resolved = path.resolve()
        if resolved in seen:
            continue
        seen.add(resolved)
        unique.append(path)
    return tuple(unique)


def missing_candidate_path(storage_path: str, *, source_root: Path) -> Path:
    path = Path(storage_path)
    return path if path.is_absolute() else source_root / path


def resolve_asset_key(*, local_path: Path, source_root: Path) -> str:
    try:
        return local_path.resolve().relative_to(source_root.resolve()).as_posix()
    except ValueError as error:
        raise AssetStorageMigrationError(f"asset file outside source root: {local_path}") from error


def read_required_file(path: Path) -> bytes:
    if not path.is_file():
        raise AssetStorageMigrationError(f"asset file missing: {path}")
    return path.read_bytes()
