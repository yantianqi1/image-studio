from __future__ import annotations

from io import BytesIO
from pathlib import Path, PurePosixPath
from typing import BinaryIO


class LocalAssetStorage:
    def __init__(self, *, root: Path) -> None:
        self.root = root

    def write_bytes(self, key: str, content: bytes, mime_type: str) -> None:
        del mime_type
        path = self.resolve_path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)

    def read_bytes(self, key: str) -> bytes:
        return self.resolve_path(key).read_bytes()

    def open_read(self, key: str) -> BinaryIO:
        return BytesIO(self.read_bytes(key))

    def exists(self, key: str) -> bool:
        return self.resolve_path(key).is_file()

    def delete(self, key: str) -> None:
        self.resolve_path(key).unlink()

    def resolve_path(self, key: str) -> Path:
        validate_storage_key(key)
        return self.root / key


def validate_storage_key(key: str) -> None:
    parsed = PurePosixPath(key)
    if not key or parsed.is_absolute() or ".." in parsed.parts:
        raise ValueError("asset storage key must be relative")
