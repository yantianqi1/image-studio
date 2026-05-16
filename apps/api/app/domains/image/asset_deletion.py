from __future__ import annotations

from apps.api.app.domains.image.assets import thumbnail_asset_key
from apps.api.app.domains.image.models import Asset
from apps.api.app.infra.storage.asset_storage import AssetStorage


def delete_asset_objects(asset: Asset, storage: AssetStorage) -> None:
    delete_existing_storage_object(storage, asset.storage_path)
    delete_existing_storage_object(storage, thumbnail_asset_key(asset.storage_path))


def delete_existing_storage_object(storage: AssetStorage, key: str) -> None:
    if storage.exists(key):
        storage.delete(key)
