from __future__ import annotations

from hashlib import sha256
from io import BytesIO

from PIL import Image
from sqlalchemy import select

from apps.api.app.domains.image.assets import ensure_thumbnail_exists, persist_rendered_asset
from apps.api.app.domains.image.models import OutboxEvent
from apps.api.app.infra.db.session import initialize_database, session_scope


class RenderedImage:
    def __init__(self, *, content: bytes, mime_type: str) -> None:
        self.content = content
        self.mime_type = mime_type


class RecordingStorage:
    backend_name = "gcs"

    def __init__(self) -> None:
        self.objects: dict[str, tuple[bytes, str]] = {}

    def write_bytes(self, key: str, content: bytes, mime_type: str) -> None:
        self.objects[key] = (content, mime_type)

    def read_bytes(self, key: str) -> bytes:
        return self.objects[key][0]

    def exists(self, key: str) -> bool:
        return key in self.objects


def test_persist_rendered_asset_records_metadata_and_created_outbox() -> None:
    initialize_database()
    storage = RecordingStorage()
    content = build_png_bytes(width=12, height=8)

    with session_scope() as session:
        asset = persist_rendered_asset(
            session,
            storage=storage,
            rendered=RenderedImage(content=content, mime_type="image/png"),
            user_id=None,
        )
        event = session.execute(select(OutboxEvent).where(OutboxEvent.aggregate_id == str(asset.id))).scalar_one()
        asset_id = asset.id

    assert asset.size_bytes == len(content)
    assert asset.sha256 == sha256(content).hexdigest()
    assert asset.width == 12
    assert asset.height == 8
    assert asset.storage_backend == "gcs"
    assert event.aggregate_type == "asset"
    assert event.event_type == "asset.created"
    assert event.payload["asset_id"] == asset_id


def test_ensure_thumbnail_exists_records_thumbnail_storage_path() -> None:
    initialize_database()
    storage = RecordingStorage()
    content = build_png_bytes(width=12, height=8)

    with session_scope() as session:
        asset = persist_rendered_asset(
            session,
            storage=storage,
            rendered=RenderedImage(content=content, mime_type="image/png"),
            user_id=None,
        )
        ensure_thumbnail_exists(asset, storage)

    assert asset.thumbnail_storage_path == f"asset-{asset.id}.thumb.jpg"
    assert storage.exists(asset.thumbnail_storage_path)


def build_png_bytes(*, width: int, height: int) -> bytes:
    output = BytesIO()
    Image.new("RGB", (width, height), color=(31, 41, 55)).save(output, format="PNG")
    return output.getvalue()
