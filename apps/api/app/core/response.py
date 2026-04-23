from __future__ import annotations

from typing import Any


def api_ok(data: Any, meta: dict[str, Any] | None = None) -> dict[str, Any]:
    return {
        "data": data,
        "meta": meta or {},
        "error": None,
    }


def api_error(*, code: str, message: str) -> dict[str, Any]:
    return {
        "data": None,
        "meta": {},
        "error": {
            "code": code,
            "message": message,
        },
    }
