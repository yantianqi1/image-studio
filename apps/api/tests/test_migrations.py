from __future__ import annotations

import os
import subprocess
from pathlib import Path

from sqlalchemy import create_engine, inspect, text

from apps.api.app.core.config import get_settings
from apps.api.app.infra.db.session import get_engine, get_session_factory, initialize_database

HEAD_REVISION = "20260427_000009"
REPO_ROOT = Path(__file__).resolve().parents[3]


def test_alembic_upgrade_creates_core_tables(tmp_path):
    database_path = tmp_path / "alembic.db"
    env = os.environ.copy()
    env["DATABASE_URL"] = f"sqlite:///{database_path}"
    env["APP_ENV"] = "test"
    env["APP_VERSION"] = "0.1.0"

    result = subprocess.run(
        ["alembic", "-c", "alembic.ini", "upgrade", "head"],
        cwd=REPO_ROOT,
        env=env,
        capture_output=True,
        text=True,
        timeout=60,
    )

    assert result.returncode == 0, result.stderr

    engine = create_engine(env["DATABASE_URL"], future=True)
    inspector = inspect(engine)

    assert inspector.has_table("users")
    assert inspector.has_table("providers")
    assert inspector.has_table("sellable_models")
    assert inspector.has_table("image_jobs")
    assert inspector.has_table("image_job_reference_assets")
    assert inspector.has_table("anonymous_sessions")
    assert inspector.has_table("site_settings")

    image_job_columns = {column["name"] for column in inspector.get_columns("image_jobs")}
    assert {
        "provider_id",
        "provider_model",
        "client_access_id",
        "client_provider_config",
        "anonymous_session_id",
    } <= image_job_columns

    asset_columns = {column["name"] for column in inspector.get_columns("assets")}
    assert {"owner_user_id", "owner_anonymous_session_id"} <= asset_columns

    anonymous_session_columns = {column["name"] for column in inspector.get_columns("anonymous_sessions")}
    assert {"id", "token_hash", "created_at", "revoked_at", "rotated_from_id"} <= anonymous_session_columns

    reference_columns = {column["name"] for column in inspector.get_columns("image_job_reference_assets")}
    assert {"id", "job_id", "asset_id", "sequence", "created_at"} <= reference_columns
    reference_indexes = {index["name"] for index in inspector.get_indexes("image_job_reference_assets")}
    assert {"ix_image_job_reference_assets_job_id", "ix_image_job_reference_assets_asset_id"} <= reference_indexes

    comic_task_columns = {column["name"] for column in inspector.get_columns("comic_tasks")}
    assert {
        "stage",
        "progress_percent",
        "user_id",
        "anonymous_session_id",
        "client_access_id",
        "client_provider_config",
        "request_ip_hash",
    } <= comic_task_columns
    comic_project_columns = {column["name"] for column in inspector.get_columns("comic_projects")}
    assert {"owner_user_id", "owner_anonymous_session_id"} <= comic_project_columns
    assert inspector.has_table("comic_story_analyses")
    assert inspector.has_table("comic_character_cards")
    assert inspector.has_table("comic_storyboards")
    assert inspector.has_table("comic_panel_prompts")

    with engine.begin() as connection:
        version_rows = connection.execute(text("SELECT version_num FROM alembic_version")).fetchall()

    assert version_rows == [(HEAD_REVISION,)]


def test_initialize_database_runs_alembic_to_head(tmp_path):
    database_path = tmp_path / "initialize.db"
    os.environ["DATABASE_URL"] = f"sqlite:///{database_path}"
    os.environ["APP_ENV"] = "test"
    os.environ["APP_VERSION"] = "0.1.0"
    get_settings.cache_clear()
    get_engine.cache_clear()
    get_session_factory.cache_clear()

    initialize_database()

    engine = create_engine(os.environ["DATABASE_URL"], future=True)
    inspector = inspect(engine)

    assert inspector.has_table("users")
    assert inspector.has_table("image_jobs")
    assert inspector.has_table("image_job_reference_assets")
    assert inspector.has_table("anonymous_sessions")
    assert inspector.has_table("site_settings")

    with engine.begin() as connection:
        version_rows = connection.execute(text("SELECT version_num FROM alembic_version")).fetchall()

    assert version_rows == [(HEAD_REVISION,)]
