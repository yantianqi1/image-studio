"""baseline schema

Revision ID: 20260424_000001
Revises: None
Create Date: 2026-04-24 00:00:01
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260424_000001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "admin_users",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("username", sa.String(length=128), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("role", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_admin_users_username", "admin_users", ["username"], unique=True)

    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("display_name", sa.String(length=255), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "admin_sessions",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("admin_user_id", sa.Integer(), sa.ForeignKey("admin_users.id"), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_admin_sessions_admin_user_id", "admin_sessions", ["admin_user_id"], unique=False)
    op.create_index("ix_admin_sessions_token_hash", "admin_sessions", ["token_hash"], unique=True)

    op.create_table(
        "user_sessions",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_user_sessions_user_id", "user_sessions", ["user_id"], unique=False)
    op.create_index("ix_user_sessions_token_hash", "user_sessions", ["token_hash"], unique=True)

    op.create_table(
        "activation_code_batches",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("credit_amount_cents", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )

    op.create_table(
        "wallets",
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), primary_key=True),
        sa.Column("balance_cents", sa.Integer(), nullable=False),
        sa.Column("locked_cents", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(length=8), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )

    op.create_table(
        "wallet_ledger",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("amount_cents", sa.Integer(), nullable=False),
        sa.Column("balance_after_cents", sa.Integer(), nullable=False),
        sa.Column("reason", sa.String(length=64), nullable=False),
        sa.Column("reference_type", sa.String(length=64), nullable=False),
        sa.Column("reference_id", sa.String(length=128), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_wallet_ledger_user_id", "wallet_ledger", ["user_id"], unique=False)

    op.create_table(
        "wallet_reservations",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("amount_cents", sa.Integer(), nullable=False),
        sa.Column("reason", sa.String(length=64), nullable=False),
        sa.Column("reference_type", sa.String(length=64), nullable=False),
        sa.Column("reference_id", sa.String(length=128), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("committed_at", sa.DateTime(), nullable=True),
        sa.Column("released_at", sa.DateTime(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=False),
    )
    op.create_index("ix_wallet_reservations_user_id", "wallet_reservations", ["user_id"], unique=False)

    op.create_table(
        "providers",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("type", sa.String(length=64), nullable=False),
        sa.Column("base_url", sa.String(length=255), nullable=True),
        sa.Column("api_key_env", sa.String(length=128), nullable=True),
        sa.Column("default_model", sa.String(length=128), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_providers_name", "providers", ["name"], unique=True)

    op.create_table(
        "sellable_models",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("code", sa.String(length=128), nullable=False),
        sa.Column("display_name", sa.String(length=128), nullable=False),
        sa.Column("capability", sa.String(length=32), nullable=False),
        sa.Column("provider_id", sa.Integer(), sa.ForeignKey("providers.id"), nullable=False),
        sa.Column("provider_model", sa.String(length=128), nullable=False),
        sa.Column("public_enabled", sa.Boolean(), nullable=False),
        sa.Column("member_price_cents", sa.Integer(), nullable=False),
        sa.Column("anonymous_price_cents", sa.Integer(), nullable=False),
    )
    op.create_index("ix_sellable_models_code", "sellable_models", ["code"], unique=True)

    op.create_table(
        "assets",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("owner_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("storage_path", sa.String(length=255), nullable=False),
        sa.Column("mime_type", sa.String(length=128), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )

    op.create_table(
        "image_jobs",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("source", sa.String(length=32), nullable=False),
        sa.Column("mode", sa.String(length=32), nullable=False),
        sa.Column("prompt", sa.Text(), nullable=False),
        sa.Column("model_code", sa.String(length=128), nullable=False),
        sa.Column("provider_id", sa.Integer(), sa.ForeignKey("providers.id"), nullable=True),
        sa.Column("provider_model", sa.String(length=128), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("requested_count", sa.Integer(), nullable=False),
        sa.Column("attempt_count", sa.Integer(), nullable=False),
        sa.Column("max_attempts", sa.Integer(), nullable=False),
        sa.Column("charge_cents", sa.Integer(), nullable=False),
        sa.Column("reservation_id", sa.Integer(), sa.ForeignKey("wallet_reservations.id"), nullable=True),
        sa.Column("error_code", sa.String(length=64), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("available_at", sa.DateTime(), nullable=False),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("finished_at", sa.DateTime(), nullable=True),
    )

    op.create_table(
        "image_job_results",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("job_id", sa.Integer(), sa.ForeignKey("image_jobs.id"), nullable=False),
        sa.Column("result_index", sa.Integer(), nullable=False),
        sa.Column("asset_id", sa.Integer(), sa.ForeignKey("assets.id"), nullable=False),
        sa.Column("asset_url", sa.String(length=255), nullable=False),
        sa.Column("revised_prompt", sa.Text(), nullable=True),
        sa.Column("provider_request_id", sa.String(length=255), nullable=True),
    )
    op.create_index("ix_image_job_results_job_id", "image_job_results", ["job_id"], unique=False)

    op.create_table(
        "comic_projects",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("genre", sa.String(length=128), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )

    op.create_table(
        "comic_characters",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("project_id", sa.String(length=64), sa.ForeignKey("comic_projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("role", sa.String(length=128), nullable=False),
        sa.Column("profile", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_comic_characters_project_id", "comic_characters", ["project_id"], unique=False)

    op.create_table(
        "comic_chapters",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("project_id", sa.String(length=64), sa.ForeignKey("comic_projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_comic_chapters_project_id", "comic_chapters", ["project_id"], unique=False)

    op.create_table(
        "comic_scenes",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("chapter_id", sa.String(length=64), sa.ForeignKey("comic_chapters.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("shots", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_comic_scenes_chapter_id", "comic_scenes", ["chapter_id"], unique=False)

    op.create_table(
        "comic_tasks",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("project_id", sa.String(length=64), sa.ForeignKey("comic_projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("chapter_id", sa.String(length=64), sa.ForeignKey("comic_chapters.id", ondelete="CASCADE"), nullable=True),
        sa.Column("scene_id", sa.String(length=64), sa.ForeignKey("comic_scenes.id", ondelete="CASCADE"), nullable=True),
        sa.Column("task_type", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("input_payload", sa.JSON(), nullable=False),
        sa.Column("output_payload", sa.JSON(), nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_comic_tasks_project_id", "comic_tasks", ["project_id"], unique=False)
    op.create_index("ix_comic_tasks_chapter_id", "comic_tasks", ["chapter_id"], unique=False)
    op.create_index("ix_comic_tasks_scene_id", "comic_tasks", ["scene_id"], unique=False)

    op.create_table(
        "activation_codes",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("batch_id", sa.Integer(), sa.ForeignKey("activation_code_batches.id"), nullable=False),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("credit_amount_cents", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("redeemed_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("redeemed_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_activation_codes_code", "activation_codes", ["code"], unique=True)

    op.create_table(
        "site_settings",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("site_title", sa.String(length=255), nullable=False),
        sa.Column("allow_public_signup", sa.Boolean(), nullable=False),
        sa.Column("allow_anonymous_image", sa.Boolean(), nullable=False),
        sa.Column("uploads_enabled", sa.Boolean(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("site_settings")
    op.drop_index("ix_activation_codes_code", table_name="activation_codes")
    op.drop_table("activation_codes")
    op.drop_index("ix_comic_tasks_scene_id", table_name="comic_tasks")
    op.drop_index("ix_comic_tasks_chapter_id", table_name="comic_tasks")
    op.drop_index("ix_comic_tasks_project_id", table_name="comic_tasks")
    op.drop_table("comic_tasks")
    op.drop_index("ix_comic_scenes_chapter_id", table_name="comic_scenes")
    op.drop_table("comic_scenes")
    op.drop_index("ix_comic_chapters_project_id", table_name="comic_chapters")
    op.drop_table("comic_chapters")
    op.drop_index("ix_comic_characters_project_id", table_name="comic_characters")
    op.drop_table("comic_characters")
    op.drop_table("comic_projects")
    op.drop_index("ix_image_job_results_job_id", table_name="image_job_results")
    op.drop_table("image_job_results")
    op.drop_table("image_jobs")
    op.drop_table("assets")
    op.drop_index("ix_sellable_models_code", table_name="sellable_models")
    op.drop_table("sellable_models")
    op.drop_index("ix_providers_name", table_name="providers")
    op.drop_table("providers")
    op.drop_index("ix_wallet_reservations_user_id", table_name="wallet_reservations")
    op.drop_table("wallet_reservations")
    op.drop_index("ix_wallet_ledger_user_id", table_name="wallet_ledger")
    op.drop_table("wallet_ledger")
    op.drop_table("wallets")
    op.drop_table("activation_code_batches")
    op.drop_index("ix_user_sessions_token_hash", table_name="user_sessions")
    op.drop_index("ix_user_sessions_user_id", table_name="user_sessions")
    op.drop_table("user_sessions")
    op.drop_index("ix_admin_sessions_token_hash", table_name="admin_sessions")
    op.drop_index("ix_admin_sessions_admin_user_id", table_name="admin_sessions")
    op.drop_table("admin_sessions")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
    op.drop_index("ix_admin_users_username", table_name="admin_users")
    op.drop_table("admin_users")
