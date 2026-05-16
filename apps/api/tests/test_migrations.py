from __future__ import annotations

import os
import subprocess
from pathlib import Path

from sqlalchemy import create_engine, inspect, text

from apps.api.app.core.config import get_settings
from apps.api.app.domains.image.models import Asset
from apps.api.app.domains.image.storage_migration import (
    AssetStorageMigrationError,
    migrate_local_assets_to_storage,
)
from apps.api.app.infra.db.session import get_engine, get_session_factory, initialize_database

HEAD_REVISION = "20260516_000022"
REPO_ROOT = Path(__file__).resolve().parents[3]
IMAGE_JOB_PROVIDER_USAGE_COLUMNS = {
    "provider_input_tokens",
    "provider_output_tokens",
    "provider_total_tokens",
    "raw_provider_cost_cents",
    "provider_fee_cents",
    "internal_cost_cents",
    "provider_usage",
}


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

    assert_core_schema(inspector)
    assert_alembic_head(engine)


def assert_core_schema(inspector) -> None:
    assert inspector.has_table("users")
    assert inspector.has_table("providers")
    assert inspector.has_table("sellable_models")
    assert inspector.has_table("image_jobs")
    assert inspector.has_table("image_job_reference_assets")
    assert inspector.has_table("character_library_entries")
    assert inspector.has_table("anonymous_sessions")
    assert inspector.has_table("site_settings")
    assert_site_settings_schema(inspector)
    assert_sellable_model_schema(inspector)
    assert_image_job_schema(inspector)
    assert_asset_schema(inspector)
    assert_owner_schema(inspector)
    assert_reference_asset_schema(inspector)
    assert_character_library_schema(inspector)
    assert_comic_schema(inspector)


def assert_site_settings_schema(inspector) -> None:
    site_settings_columns = {column["name"] for column in inspector.get_columns("site_settings")}
    assert "client_provider_url_pool" in site_settings_columns


def assert_sellable_model_schema(inspector) -> None:
    sellable_model_columns = {column["name"] for column in inspector.get_columns("sellable_models")}
    assert "status" in sellable_model_columns
    variant_columns = {column["name"] for column in inspector.get_columns("model_variants")}
    assert {"upstream_cost_credits", "upstream_cost_cents", "profit_margin_basis_points"} <= variant_columns
    sellable_model_indexes = {index["name"] for index in inspector.get_indexes("sellable_models")}
    assert "ix_sellable_models_status" in sellable_model_indexes


def assert_image_job_schema(inspector) -> None:
    image_job_columns = {column["name"] for column in inspector.get_columns("image_jobs")}
    assert {
        "provider_id",
        "provider_model",
        "client_access_id",
        "client_provider_config",
        "anonymous_session_id",
        "storage_subdir",
        "conversation_messages",
        "title",
        "visibility",
        *IMAGE_JOB_PROVIDER_USAGE_COLUMNS,
    } <= image_job_columns


def assert_asset_schema(inspector) -> None:
    asset_columns = {column["name"] for column in inspector.get_columns("assets")}
    assert {"owner_user_id", "owner_anonymous_session_id", "visibility", "published_at"} <= asset_columns
    asset_indexes = {index["name"] for index in inspector.get_indexes("assets")}
    assert "ix_assets_visibility" in asset_indexes


def assert_owner_schema(inspector) -> None:
    anonymous_session_columns = {column["name"] for column in inspector.get_columns("anonymous_sessions")}
    assert {"id", "token_hash", "created_at", "revoked_at", "rotated_from_id"} <= anonymous_session_columns


def assert_reference_asset_schema(inspector) -> None:
    reference_columns = {column["name"] for column in inspector.get_columns("image_job_reference_assets")}
    assert {"id", "job_id", "asset_id", "sequence", "created_at"} <= reference_columns
    reference_indexes = {index["name"] for index in inspector.get_indexes("image_job_reference_assets")}
    assert {"ix_image_job_reference_assets_job_id", "ix_image_job_reference_assets_asset_id"} <= reference_indexes


def assert_character_library_schema(inspector) -> None:
    character_columns = {column["name"] for column in inspector.get_columns("character_library_entries")}
    assert {"id", "name", "asset_id", "visibility", "owner_user_id", "created_by_admin_user_id"} <= character_columns
    character_indexes = {index["name"] for index in inspector.get_indexes("character_library_entries")}
    assert "ix_character_library_entries_visibility" in character_indexes


def assert_comic_schema(inspector) -> None:
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


def assert_alembic_head(engine) -> None:
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
    assert inspector.has_table("character_library_entries")
    assert inspector.has_table("anonymous_sessions")
    assert inspector.has_table("site_settings")

    sellable_model_columns = {column["name"] for column in inspector.get_columns("sellable_models")}
    assert "status" in sellable_model_columns

    with engine.begin() as connection:
        version_rows = connection.execute(text("SELECT version_num FROM alembic_version")).fetchall()

    assert version_rows == [(HEAD_REVISION,)]


class RecordingStorage:
    def __init__(self) -> None:
        self.objects: dict[str, tuple[bytes, str]] = {}

    def write_bytes(self, key: str, content: bytes, mime_type: str) -> None:
        self.objects[key] = (content, mime_type)

    def read_bytes(self, key: str) -> bytes:
        return self.objects[key][0]

    def exists(self, key: str) -> bool:
        return key in self.objects

    def delete(self, key: str) -> None:
        del self.objects[key]


def test_asset_storage_migration_uploads_local_files_and_rewrites_keys(tmp_path):
    initialize_database()
    storage = RecordingStorage()
    first_path = tmp_path / "generated-assets" / "asset-1.png"
    second_path = tmp_path / "generated-assets" / "uploads" / "upload-2.jpg"
    first_path.parent.mkdir(parents=True)
    second_path.parent.mkdir(parents=True)
    first_path.write_bytes(b"first-bytes")
    second_path.write_bytes(b"second-bytes")

    with get_session_factory()() as session:
        first_asset = Asset(storage_path=str(first_path), mime_type="image/png")
        second_asset = Asset(storage_path=str(second_path), mime_type="image/jpeg")
        session.add_all([first_asset, second_asset])
        session.commit()

        result = migrate_local_assets_to_storage(
            session,
            source_root=tmp_path / "generated-assets",
            target_storage=storage,
        )
        session.commit()

        assert result.migrated_count == 2
        assert first_asset.storage_path == "asset-1.png"
        assert second_asset.storage_path == "uploads/upload-2.jpg"

    assert storage.objects == {
        "asset-1.png": (b"first-bytes", "image/png"),
        "uploads/upload-2.jpg": (b"second-bytes", "image/jpeg"),
    }


def test_asset_storage_migration_uploads_relative_keys_from_source_root(tmp_path):
    initialize_database()
    storage = RecordingStorage()
    source_root = tmp_path / "generated-assets"
    source_path = source_root / "asset-1.png"
    source_path.parent.mkdir(parents=True)
    source_path.write_bytes(b"image-bytes")

    with get_session_factory()() as session:
        asset = Asset(storage_path="asset-1.png", mime_type="image/png")
        session.add(asset)
        session.commit()

        result = migrate_local_assets_to_storage(
            session,
            source_root=source_root,
            target_storage=storage,
        )
        session.commit()

        assert result.migrated_count == 1
        assert asset.storage_path == "asset-1.png"

    assert storage.objects == {"asset-1.png": (b"image-bytes", "image/png")}


def test_asset_storage_migration_fails_when_local_file_is_missing(tmp_path):
    initialize_database()
    storage = RecordingStorage()

    with get_session_factory()() as session:
        asset = Asset(storage_path=str(tmp_path / "missing.png"), mime_type="image/png")
        session.add(asset)
        session.commit()

        try:
            migrate_local_assets_to_storage(
                session,
                source_root=tmp_path,
                target_storage=storage,
            )
        except AssetStorageMigrationError as exc:
            assert str(exc) == f"asset file missing: {tmp_path / 'missing.png'}"
        else:
            raise AssertionError("expected missing file to fail")

    assert storage.objects == {}
