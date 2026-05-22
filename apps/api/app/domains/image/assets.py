from __future__ import annotations

import mimetypes
from io import BytesIO
from pathlib import Path, PurePosixPath

from PIL import Image, UnidentifiedImageError
from sqlalchemy.orm import Session

from apps.api.app.domains.image.asset_metadata import build_asset_content_metadata
from apps.api.app.domains.image.asset_thumbnails import (
    api_thumbnail_url,
    ensure_thumbnail_exists,
    resolve_public_thumbnail_url,
    resolve_thumbnail_content,
    thumbnail_asset_key,
)
from apps.api.app.domains.image.events import record_asset_created_event
from apps.api.app.domains.image.models import Asset
from apps.api.app.infra.storage.asset_storage import AssetStorage

DEFAULT_UPLOAD_EXTENSION = ".bin"
DEFAULT_UPLOAD_MIME_TYPE = "application/octet-stream"
MAX_SUFFIX_LENGTH = 10
SVG_MIME_TYPE = "image/svg+xml"

MAGIC_BYTES_MAP: list[tuple[bytes, int, str]] = [
    (b"\x89PNG\r\n\x1a\n", 0, "image/png"),
    (b"\xff\xd8\xff", 0, "image/jpeg"),
    (b"GIF87a", 0, "image/gif"),
    (b"GIF89a", 0, "image/gif"),
    (b"RIFF", 0, "image/webp"),
    (b"BM", 0, "image/bmp"),
    (b"\x00\x00\x01\x00", 0, "image/x-icon"),
]

COMPATIBLE_MIME_TYPES = frozenset({
    "image/png",
    "image/jpeg",
    "image/gif",
    "image/webp",
})

MIME_TO_EXTENSION: dict[str, str] = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/bmp": ".bmp",
    "image/tiff": ".tiff",
    "image/avif": ".avif",
    "image/heic": ".heic",
    "image/heif": ".heif",
    "image/svg+xml": ".svg",
}


def detect_image_mime_type(content: bytes) -> str | None:
    for magic, offset, mime_type in MAGIC_BYTES_MAP:
        if content[offset:offset + len(magic)] == magic:
            if mime_type == "image/webp":
                if content[8:12] == b"WEBP":
                    return mime_type
                return None
            return mime_type
    if _is_avif(content):
        return "image/avif"
    if _is_heic(content):
        return "image/heic"
    if content[:4] in (b"II\x2a\x00", b"MM\x00\x2a"):
        return "image/tiff"
    return None


def _is_avif(content: bytes) -> bool:
    if len(content) < 12:
        return False
    return content[4:8] == b"ftyp" and content[8:12] in (b"avif", b"avis")


def _is_heic(content: bytes) -> bool:
    if len(content) < 12:
        return False
    return content[4:8] == b"ftyp" and content[8:12] in (b"heic", b"heix", b"mif1")


def normalize_upload_image(content: bytes, declared_mime: str) -> tuple[bytes, str]:
    detected_mime = detect_image_mime_type(content)
    if detected_mime is None:
        return content, declared_mime
    if detected_mime in COMPATIBLE_MIME_TYPES:
        return content, detected_mime
    try:
        with Image.open(BytesIO(content)) as img:
            output = BytesIO()
            img = img.convert("RGBA") if img.mode in ("RGBA", "LA", "PA") else img.convert("RGB")
            if img.mode == "RGBA":
                img.save(output, format="PNG", optimize=True)
                return output.getvalue(), "image/png"
            img.save(output, format="PNG", optimize=True)
            return output.getvalue(), "image/png"
    except (UnidentifiedImageError, OSError):
        return content, detected_mime


def persist_rendered_asset(
    session: Session,
    *,
    storage: AssetStorage,
    rendered,
    user_id: int | None,
    anonymous_session_id: int | None = None,
    client_id: str | None = None,
    storage_subdir: str | None = None,
) -> Asset:
    asset = create_pending_asset(
        session,
        mime_type=rendered.mime_type,
        owner_user_id=user_id,
        owner_anonymous_session_id=anonymous_session_id,
        owner_client_id=client_id,
    )
    apply_asset_content_metadata(asset, content=rendered.content, storage=storage)
    key = rendered_asset_key(
        asset_id=asset.id,
        mime_type=rendered.mime_type,
        storage_subdir=storage_subdir,
    )
    storage.write_bytes(key, rendered.content, rendered.mime_type)
    asset.storage_path = key
    record_asset_created_event(session, asset=asset)
    session.flush()
    return asset


def rendered_asset_key(*, asset_id: int, mime_type: str, storage_subdir: str | None) -> str:
    filename = f"asset-{asset_id}{resolve_rendered_suffix(mime_type)}"
    if not storage_subdir:
        return filename
    return str(PurePosixPath(storage_subdir) / filename)


def resolve_rendered_suffix(mime_type: str) -> str:
    guessed = mimetypes.guess_extension(mime_type)
    if is_safe_suffix(guessed):
        return str(guessed)
    return DEFAULT_UPLOAD_EXTENSION


def persist_uploaded_asset(
    session: Session,
    *,
    storage: AssetStorage,
    content: bytes,
    filename: str | None,
    mime_type: str | None,
    user_id: int | None,
    anonymous_session_id: int | None = None,
    client_id: str | None = None,
) -> Asset:
    declared_mime = normalize_mime_type(mime_type)
    if declared_mime.startswith("image/") and declared_mime != SVG_MIME_TYPE:
        content, declared_mime = normalize_upload_image(content, declared_mime)
    asset = create_pending_asset(
        session,
        mime_type=declared_mime,
        owner_user_id=user_id,
        owner_anonymous_session_id=anonymous_session_id,
        owner_client_id=client_id,
    )
    apply_asset_content_metadata(asset, content=content, storage=storage)
    suffix = resolve_upload_suffix(filename=filename, mime_type=asset.mime_type)
    key = f"uploads/upload-{asset.id}{suffix}"
    storage.write_bytes(key, content, asset.mime_type)
    asset.storage_path = key
    record_asset_created_event(session, asset=asset)
    session.flush()
    return asset


def apply_asset_content_metadata(asset: Asset, *, content: bytes, storage: AssetStorage) -> None:
    metadata = build_asset_content_metadata(content=content, mime_type=asset.mime_type, storage=storage)
    asset.size_bytes = metadata.size_bytes
    asset.sha256 = metadata.sha256
    asset.width = metadata.width
    asset.height = metadata.height
    asset.storage_backend = metadata.storage_backend


def create_pending_asset(
    session: Session,
    *,
    mime_type: str,
    owner_user_id: int | None,
    owner_anonymous_session_id: int | None,
    owner_client_id: str | None,
) -> Asset:
    asset = Asset(
        owner_user_id=owner_user_id,
        owner_anonymous_session_id=owner_anonymous_session_id,
        owner_client_id=owner_client_id,
        storage_path="",
        mime_type=mime_type,
    )
    session.add(asset)
    session.flush()
    return asset


def normalize_mime_type(mime_type: str | None) -> str:
    normalized = str(mime_type or "").strip()
    return normalized or DEFAULT_UPLOAD_MIME_TYPE


def resolve_upload_suffix(*, filename: str | None, mime_type: str) -> str:
    known = MIME_TO_EXTENSION.get(mime_type)
    if known:
        return known
    suffix = Path(filename or "").suffix.lower()
    if is_safe_suffix(suffix):
        return suffix
    guessed = mimetypes.guess_extension(mime_type)
    if is_safe_suffix(guessed):
        return str(guessed)
    return DEFAULT_UPLOAD_EXTENSION


def is_safe_suffix(suffix: str | None) -> bool:
    if not suffix or len(suffix) > MAX_SUFFIX_LENGTH or not suffix.startswith("."):
        return False
    return suffix[1:].isalnum()


def resolve_asset_content(asset: Asset, storage: AssetStorage) -> tuple[bytes, str]:
    return storage.read_bytes(asset.storage_path), asset.mime_type


def resolve_asset_public_urls(asset: Asset, storage: AssetStorage) -> tuple[str, str]:
    direct_url = storage.public_url(asset.storage_path)
    if direct_url is None:
        asset_url = f"/api/public/image/assets/{asset.id}"
        thumb_url = api_thumbnail_url(asset)
    else:
        asset_url = direct_url
        thumb_url = resolve_public_thumbnail_url(asset, storage=storage)
    return asset_url, thumb_url
