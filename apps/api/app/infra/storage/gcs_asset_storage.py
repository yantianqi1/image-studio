from __future__ import annotations

from io import BytesIO
from typing import BinaryIO

from apps.api.app.infra.storage.local_asset_storage import validate_storage_key


class GcsAssetStorage:
    def __init__(self, *, bucket_name: str, prefix: str, client=None) -> None:
        if not bucket_name:
            raise ValueError("asset storage gcs bucket is required")
        self.bucket_name = bucket_name
        self.prefix = normalize_prefix(prefix)
        self.client = client or build_gcs_client()

    def write_bytes(self, key: str, content: bytes, mime_type: str) -> None:
        self.blob(key).upload_from_string(content, content_type=mime_type)

    def read_bytes(self, key: str) -> bytes:
        return self.blob(key).download_as_bytes()

    def open_read(self, key: str) -> BinaryIO:
        return BytesIO(self.read_bytes(key))

    def exists(self, key: str) -> bool:
        return bool(self.blob(key).exists())

    def delete(self, key: str) -> None:
        self.blob(key).delete()

    def blob(self, key: str):
        return self.client.bucket(self.bucket_name).blob(self.object_key(key))

    def public_url(self, key: str) -> str | None:
        object_name = self.object_key(key)
        return f"https://storage.googleapis.com/{self.bucket_name}/{object_name}"

    def object_key(self, key: str) -> str:
        validate_storage_key(key)
        return f"{self.prefix}/{key}" if self.prefix else key


def normalize_prefix(prefix: str) -> str:
    normalized = str(prefix or "").strip("/")
    if normalized:
        validate_storage_key(normalized)
    return normalized


def build_gcs_client():
    from google.cloud import storage

    return storage.Client()
