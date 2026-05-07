from __future__ import annotations

from pathlib import Path

from apps.api.app.core.config import AppSettings, get_settings
from apps.api.app.infra.storage.asset_storage import AssetStorage
from apps.api.app.infra.storage.gcs_asset_storage import GcsAssetStorage
from apps.api.app.infra.storage.local_asset_storage import LocalAssetStorage

ASSET_STORAGE_BACKEND_LOCAL = "local"
ASSET_STORAGE_BACKEND_GCS = "gcs"


def build_asset_storage(settings: AppSettings | None = None) -> AssetStorage:
    resolved_settings = settings or get_settings()
    backend = resolved_settings.asset_storage_backend.strip().lower()
    if backend == ASSET_STORAGE_BACKEND_LOCAL:
        return LocalAssetStorage(root=Path(resolved_settings.generated_assets_dir))
    if backend == ASSET_STORAGE_BACKEND_GCS:
        return GcsAssetStorage(
            bucket_name=resolved_settings.asset_storage_gcs_bucket,
            prefix=resolved_settings.asset_storage_gcs_prefix,
        )
    raise ValueError(f"unsupported asset storage backend: {resolved_settings.asset_storage_backend}")
