from __future__ import annotations

import mimetypes
from pathlib import Path

from sqlalchemy.orm import Session

from apps.api.app.domains.image.models import Asset

DEFAULT_UPLOAD_EXTENSION = ".bin"
DEFAULT_UPLOAD_MIME_TYPE = "application/octet-stream"
MAX_SUFFIX_LENGTH = 10


def persist_rendered_asset(
    session: Session,
    *,
    storage_dir: Path,
    rendered,
    user_id: int | None,
    anonymous_session_id: int | None = None,
    client_id: str | None = None,
) -> Asset:
    asset = create_pending_asset(
        session,
        mime_type=rendered.mime_type,
        owner_user_id=user_id,
        owner_anonymous_session_id=anonymous_session_id,
        owner_client_id=client_id,
    )
    file_path = storage_dir / f"asset-{asset.id}.svg"
    file_path.write_bytes(rendered.content)
    asset.storage_path = str(file_path)
    session.flush()
    return asset


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


def delete_asset_file(storage_path: str) -> None:
    if not storage_path:
        return
    file_path = Path(storage_path)
    if file_path.exists():
        file_path.unlink()
