from __future__ import annotations

from pathlib import Path

from alembic import command
from alembic.config import Config

from apps.api.app.core.config import get_settings


def build_alembic_config() -> Config:
    repo_root = Path(__file__).resolve().parents[5]
    config = Config(str(repo_root / "alembic.ini"))
    config.set_main_option("script_location", str(repo_root / "apps/api/alembic"))
    config.set_main_option("sqlalchemy.url", get_settings().database_url)
    return config


def migrate_to_head() -> None:
    command.upgrade(build_alembic_config(), "head")
