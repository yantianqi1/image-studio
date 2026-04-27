from __future__ import annotations

from pathlib import PurePosixPath

from apps.api.app.core.errors import AppError

ASSET_FOLDER_NAME_OUTPUT_KEY = "asset_folder_name"
COMIC_ASSETS_ROOT = "comics"
DEFAULT_FOLDER_NAME = "comic-project"
FOLDER_NAME_SEPARATOR = "--"
MAX_FOLDER_PART_LENGTH = 80
PAGES_DIR = "pages"
REFERENCES_DIR = "references"
SAFE_SEPARATORS = {"-", "_"}


def build_asset_folder_name(*, project_title: str, task_id: str) -> str:
    project_part = sanitize_folder_part(project_title, fallback=DEFAULT_FOLDER_NAME)
    task_part = sanitize_folder_part(task_id, fallback="task")
    return f"{project_part}{FOLDER_NAME_SEPARATOR}{task_part}"


def page_storage_subdir(task) -> str:
    return build_storage_subdir(task, leaf_dir=PAGES_DIR)


def reference_storage_subdir(task) -> str:
    return build_storage_subdir(task, leaf_dir=REFERENCES_DIR)


def build_storage_subdir(task, *, leaf_dir: str) -> str:
    return str(PurePosixPath(COMIC_ASSETS_ROOT) / require_asset_folder_name(task) / leaf_dir)


def require_asset_folder_name(task) -> str:
    payload = task.output_payload or {}
    value = payload.get(ASSET_FOLDER_NAME_OUTPUT_KEY) if isinstance(payload, dict) else None
    if isinstance(value, str) and value.strip():
        return value.strip()
    raise AppError(code="comic_asset_folder_missing", message="comic asset folder name is missing", status_code=409)


def sanitize_folder_part(value: str, *, fallback: str) -> str:
    sanitized = "".join(sanitized_char(char) for char in value.strip())
    collapsed = collapse_repeated_hyphens(sanitized).strip("-_")
    return (collapsed[:MAX_FOLDER_PART_LENGTH].strip("-_")) or fallback


def sanitized_char(char: str) -> str:
    if char.isalnum() or char in SAFE_SEPARATORS:
        return char
    if char.isspace():
        return "-"
    return "-"


def collapse_repeated_hyphens(value: str) -> str:
    collapsed = value
    while "--" in collapsed:
        collapsed = collapsed.replace("--", "-")
    return collapsed
