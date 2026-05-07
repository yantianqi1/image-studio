from __future__ import annotations

from apps.api.app.core.config import get_settings
from apps.api.app.infra.storage.factory import build_asset_storage
from apps.api.app.infra.storage.gcs_asset_storage import GcsAssetStorage
from apps.api.app.infra.storage.local_asset_storage import LocalAssetStorage


class FakeBlob:
    def __init__(self, key: str, objects: dict[str, tuple[bytes, str]]) -> None:
        self.key = key
        self.objects = objects
        self.deleted = False

    def upload_from_string(self, content: bytes, *, content_type: str) -> None:
        self.objects[self.key] = (content, content_type)

    def download_as_bytes(self) -> bytes:
        return self.objects[self.key][0]

    def exists(self) -> bool:
        return self.key in self.objects

    def delete(self) -> None:
        del self.objects[self.key]
        self.deleted = True


class FakeBucket:
    def __init__(self) -> None:
        self.objects: dict[str, tuple[bytes, str]] = {}

    def blob(self, key: str) -> FakeBlob:
        return FakeBlob(key=key, objects=self.objects)


class FakeClient:
    def __init__(self, bucket: FakeBucket) -> None:
        self._bucket = bucket
        self.bucket_names: list[str] = []

    def bucket(self, name: str) -> FakeBucket:
        self.bucket_names.append(name)
        return self._bucket


def test_settings_expose_asset_storage_config() -> None:
    settings = get_settings()

    assert settings.asset_storage_backend == "local"
    assert settings.asset_storage_gcs_bucket == ""
    assert settings.asset_storage_gcs_prefix == "generated-assets"


def test_local_backend_round_trips_bytes(tmp_path) -> None:
    storage = LocalAssetStorage(root=tmp_path)

    storage.write_bytes("uploads/upload-1.png", b"demo-bytes", "image/png")

    assert storage.read_bytes("uploads/upload-1.png") == b"demo-bytes"
    assert storage.exists("uploads/upload-1.png")


def test_local_backend_rejects_parent_directory_keys(tmp_path) -> None:
    storage = LocalAssetStorage(root=tmp_path)

    try:
        storage.write_bytes("../escape.png", b"demo", "image/png")
    except ValueError as exc:
        assert str(exc) == "asset storage key must be relative"
    else:
        raise AssertionError("expected invalid key to fail")


def test_gcs_backend_uses_client_objects() -> None:
    bucket = FakeBucket()
    client = FakeClient(bucket=bucket)
    storage = GcsAssetStorage(bucket_name="studio-assets", prefix="generated-assets", client=client)

    storage.write_bytes("uploads/upload-1.png", b"gcs-bytes", "image/png")

    object_key = "generated-assets/uploads/upload-1.png"
    assert client.bucket_names == ["studio-assets"]
    assert bucket.objects[object_key] == (b"gcs-bytes", "image/png")
    assert storage.read_bytes("uploads/upload-1.png") == b"gcs-bytes"
    assert storage.exists("uploads/upload-1.png")

    storage.delete("uploads/upload-1.png")

    assert not storage.exists("uploads/upload-1.png")


def test_build_asset_storage_uses_configured_backend(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("ASSET_STORAGE_BACKEND", "local")
    monkeypatch.setenv("GENERATED_ASSETS_DIR", str(tmp_path))
    get_settings.cache_clear()

    storage = build_asset_storage()

    assert isinstance(storage, LocalAssetStorage)
