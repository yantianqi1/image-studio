from __future__ import annotations

import mimetypes
from pathlib import Path

from PIL import Image, UnidentifiedImageError
from sqlalchemy.orm import Session

from apps.api.app.core.errors import AppError
from apps.api.app.domains.image.models import Asset

DEFAULT_UPLOAD_EXTENSION = ".bin"
DEFAULT_UPLOAD_MIME_TYPE = "application/octet-stream"
MAX_SUFFIX_LENGTH = 10
RASTER_THUMBNAIL_MIME_TYPE = "image/jpeg"
SVG_MIME_TYPE = "image/svg+xml"
THUMBNAIL_MAX_DIMENSION_PX = 640
THUMBNAIL_SUFFIX = ".thumb.jpg"


def persist_rendered_asset(
    session: Session,
    *,
    storage_dir: Path,
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
    file_path = rendered_asset_path(
        storage_dir=storage_dir,
        asset_id=asset.id,
        mime_type=rendered.mime_type,
        storage_subdir=storage_subdir,
    )
    file_path.parent.mkdir(parents=True, exist_ok=True)
    file_path.write_bytes(rendered.content)
    asset.storage_path = str(file_path)
    session.flush()
    return asset


def rendered_asset_path(*, storage_dir: Path, asset_id: int, mime_type: str, storage_subdir: str | None) -> Path:
    target_dir = storage_dir / storage_subdir if storage_subdir else storage_dir
    return target_dir / f"asset-{asset_id}{resolve_rendered_suffix(mime_type)}"


def resolve_rendered_suffix(mime_type: str) -> str:
    guessed = mimetypes.guess_extension(mime_type)
    if is_safe_suffix(guessed):
        return str(guessed)
    return DEFAULT_UPLOAD_EXTENSION


def persist_uploaded_asset(
    session: Session,
    *,
    storage_dir: Path,
    content: bytes,
    filename: str | None,
    mime_type: str | None,
    user_id: int | None,
    anonymous_session_id: int | None = None,
    client_id: str | None = None,
) -> Asset:
    asset = create_pending_asset(
        session,
        mime_type=normalize_mime_type(mime_type),
        owner_user_id=user_id,
        owner_anonymous_session_id=anonymous_session_id,
        owner_client_id=client_id,
    )
    suffix = resolve_upload_suffix(filename=filename, mime_type=asset.mime_type)
    file_path = storage_dir / "uploads" / f"upload-{asset.id}{suffix}"
    file_path.parent.mkdir(parents=True, exist_ok=True)
    file_path.write_bytes(content)
    asset.storage_path = str(file_path)
    session.flush()
    return asset


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


def resolve_thumbnail_file(asset: Asset) -> tuple[Path, str]:
    source_path = resolve_existing_asset_path(asset.storage_path)
    if asset.mime_type == SVG_MIME_TYPE:
        return source_path, SVG_MIME_TYPE
    if not asset.mime_type.startswith("image/"):
        raise AppError(code="asset_thumbnail_unsupported", message="asset thumbnail unsupported", status_code=415)

    target_path = thumbnail_asset_path(source_path)
    if not target_path.exists():
        write_thumbnail_file(source_path=source_path, target_path=target_path)
    return target_path, RASTER_THUMBNAIL_MIME_TYPE


def resolve_existing_asset_path(storage_path: str) -> Path:
    source_path = Path(storage_path)
    if not source_path.is_file():
        raise AppError(code="asset_file_missing", message="asset file missing", status_code=500)
    return source_path


def thumbnail_asset_path(source_path: Path) -> Path:
    return source_path.with_name(f"{source_path.stem}{THUMBNAIL_SUFFIX}")


def write_thumbnail_file(*, source_path: Path, target_path: Path) -> None:
    try:
        with Image.open(source_path) as image:
            thumbnail = create_proportional_thumbnail(image)
            target_path.parent.mkdir(parents=True, exist_ok=True)
            thumbnail.save(target_path, format="JPEG", quality=82, optimize=True)
    except UnidentifiedImageError as error:
        raise AppError(code="asset_thumbnail_invalid_image", message="asset thumbnail invalid image", status_code=422) from error


def create_proportional_thumbnail(image: Image.Image) -> Image.Image:
    thumbnail = image.copy()
    thumbnail.thumbnail((THUMBNAIL_MAX_DIMENSION_PX, THUMBNAIL_MAX_DIMENSION_PX), Image.Resampling.LANCZOS)
    return convert_thumbnail_to_rgb(thumbnail)


def convert_thumbnail_to_rgb(image: Image.Image) -> Image.Image:
    if image.mode in {"RGBA", "LA"}:
        background = Image.new("RGB", image.size, (255, 255, 255))
        background.paste(image, mask=image.getchannel("A"))
        return background
    if image.mode == "P":
        return convert_thumbnail_to_rgb(image.convert("RGBA"))
    return image.convert("RGB")


def delete_asset_file(storage_path: str) -> None:
    if not storage_path:
        return
    file_path = Path(storage_path)
    if file_path.exists():
        file_path.unlink()
