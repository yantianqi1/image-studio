from __future__ import annotations

from typing import BinaryIO, Protocol


class AssetStorage(Protocol):
    def write_bytes(self, key: str, content: bytes, mime_type: str) -> None:
        raise NotImplementedError

    def read_bytes(self, key: str) -> bytes:
        raise NotImplementedError

    def open_read(self, key: str) -> BinaryIO:
        raise NotImplementedError

    def exists(self, key: str) -> bool:
        raise NotImplementedError

    def delete(self, key: str) -> None:
        raise NotImplementedError
