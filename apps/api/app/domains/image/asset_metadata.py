from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256
from io import BytesIO

from PIL import Image, UnidentifiedImageError

from apps.api.app.core.errors import AppError
from apps.api.app.infra.storage.asset_storage import AssetStorage

DEFAULT_STORAGE_BACKEND = "local"
SVG_MIME_TYPE = "image/svg+xml"


@dataclass(frozen=True)
class AssetContentMetadata:
    size_bytes: int
    sha256: str
    width: int | None
    height: int | None
    storage_backend: str


def build_asset_content_metadata(
    *,
    content: bytes,
    mime_type: str,
    storage: AssetStorage,
) -> AssetContentMetadata:
    width, height = read_image_dimensions(content=content, mime_type=mime_type)
    return AssetContentMetadata(
        size_bytes=len(content),
        sha256=sha256(content).hexdigest(),
        width=width,
        height=height,
        storage_backend=resolve_storage_backend(storage),
    )


def read_image_dimensions(*, content: bytes, mime_type: str) -> tuple[int | None, int | None]:
    if not mime_type.startswith("image/") or mime_type == SVG_MIME_TYPE:
        return None, None
    try:
        with Image.open(BytesIO(content)) as image:
            return image.width, image.height
    except UnidentifiedImageError as error:
        raise AppError(code="asset_metadata_invalid_image", message="asset metadata invalid image", status_code=422) from error


def resolve_storage_backend(storage: AssetStorage) -> str:
    backend = getattr(storage, "backend_name", DEFAULT_STORAGE_BACKEND)
    normalized = str(backend or "").strip().lower()
    return normalized or DEFAULT_STORAGE_BACKEND
