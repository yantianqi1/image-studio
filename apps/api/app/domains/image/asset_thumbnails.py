from __future__ import annotations

from io import BytesIO
from pathlib import PurePosixPath

from PIL import Image, UnidentifiedImageError

from apps.api.app.core.errors import AppError
from apps.api.app.domains.image.models import Asset
from apps.api.app.infra.storage.asset_storage import AssetStorage

RASTER_THUMBNAIL_MIME_TYPE = "image/jpeg"
SVG_MIME_TYPE = "image/svg+xml"
THUMBNAIL_MAX_DIMENSION_PX = 640
THUMBNAIL_SUFFIX = ".thumb.jpg"


def resolve_thumbnail_content(asset: Asset, storage: AssetStorage) -> tuple[bytes, str]:
    source_content = storage.read_bytes(asset.storage_path)
    if asset.mime_type == SVG_MIME_TYPE:
        return source_content, SVG_MIME_TYPE
    if not asset.mime_type.startswith("image/"):
        raise AppError(code="asset_thumbnail_unsupported", message="asset thumbnail unsupported", status_code=415)
    target_key = thumbnail_asset_key(asset.storage_path)
    if not storage.exists(target_key):
        storage.write_bytes(target_key, build_thumbnail_bytes(source_content), RASTER_THUMBNAIL_MIME_TYPE)
    asset.thumbnail_storage_path = target_key
    return storage.read_bytes(target_key), RASTER_THUMBNAIL_MIME_TYPE


def ensure_thumbnail_exists(asset: Asset, storage: AssetStorage) -> None:
    if asset.mime_type == SVG_MIME_TYPE or not asset.mime_type.startswith("image/"):
        return
    target_key = thumbnail_asset_key(asset.storage_path)
    if not storage.exists(target_key):
        source_content = storage.read_bytes(asset.storage_path)
        storage.write_bytes(target_key, build_thumbnail_bytes(source_content), RASTER_THUMBNAIL_MIME_TYPE)
    asset.thumbnail_storage_path = target_key


def resolve_public_thumbnail_url(asset: Asset, *, storage: AssetStorage) -> str:
    thumb_key = thumbnail_asset_key(asset.storage_path)
    if storage.exists(thumb_key):
        return storage.public_url(thumb_key) or api_thumbnail_url(asset)
    return api_thumbnail_url(asset)


def api_thumbnail_url(asset: Asset) -> str:
    return f"/api/public/image/assets/{asset.id}/thumbnail"


def thumbnail_asset_key(asset_key: str) -> str:
    source_key = PurePosixPath(asset_key)
    return str(source_key.with_name(f"{source_key.stem}{THUMBNAIL_SUFFIX}"))


def build_thumbnail_bytes(source_content: bytes) -> bytes:
    try:
        with Image.open(BytesIO(source_content)) as image:
            thumbnail = create_proportional_thumbnail(image)
            output = BytesIO()
            thumbnail.save(output, format="JPEG", quality=82, optimize=True)
            return output.getvalue()
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
