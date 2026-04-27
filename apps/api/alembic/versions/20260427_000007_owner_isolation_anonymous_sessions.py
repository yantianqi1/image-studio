"""owner isolation anonymous sessions

Revision ID: 20260427_000007
Revises: 20260426_000006
Create Date: 2026-04-27 00:00:07
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260427_000007"
down_revision = "20260426_000006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    create_anonymous_sessions_table()
    add_asset_owner_columns()
    add_image_job_owner_columns()
    add_comic_project_owner_columns()
    add_comic_task_owner_columns()


def downgrade() -> None:
    drop_comic_task_owner_columns()
    drop_comic_project_owner_columns()
    drop_image_job_owner_columns()
    drop_asset_owner_columns()
    drop_anonymous_sessions_table()


def create_anonymous_sessions_table() -> None:
    op.create_table(
        "anonymous_sessions",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        sa.Column("rotated_from_id", sa.Integer(), sa.ForeignKey("anonymous_sessions.id"), nullable=True),
    )
    op.create_index("ix_anonymous_sessions_token_hash", "anonymous_sessions", ["token_hash"], unique=True)
    op.create_index("ix_anonymous_sessions_rotated_from_id", "anonymous_sessions", ["rotated_from_id"], unique=False)


def add_asset_owner_columns() -> None:
    with op.batch_alter_table("assets") as batch_op:
        batch_op.add_column(sa.Column("owner_anonymous_session_id", sa.Integer(), nullable=True))
        batch_op.create_index("ix_assets_owner_user_id", ["owner_user_id"])
        batch_op.create_index("ix_assets_owner_anonymous_session_id", ["owner_anonymous_session_id"])
        batch_op.create_foreign_key(
            "fk_assets_owner_anonymous_session_id_anonymous_sessions",
            "anonymous_sessions",
            ["owner_anonymous_session_id"],
            ["id"],
        )


def add_image_job_owner_columns() -> None:
    with op.batch_alter_table("image_jobs") as batch_op:
        batch_op.add_column(sa.Column("anonymous_session_id", sa.Integer(), nullable=True))
        batch_op.create_index("ix_image_jobs_user_id", ["user_id"])
        batch_op.create_index("ix_image_jobs_anonymous_session_id", ["anonymous_session_id"])
        batch_op.create_foreign_key(
            "fk_image_jobs_anonymous_session_id_anonymous_sessions",
            "anonymous_sessions",
            ["anonymous_session_id"],
            ["id"],
        )


def add_comic_project_owner_columns() -> None:
    with op.batch_alter_table("comic_projects") as batch_op:
        batch_op.add_column(sa.Column("owner_user_id", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("owner_anonymous_session_id", sa.Integer(), nullable=True))
        batch_op.create_index("ix_comic_projects_owner_user_id", ["owner_user_id"])
        batch_op.create_index("ix_comic_projects_owner_anonymous_session_id", ["owner_anonymous_session_id"])
        batch_op.create_foreign_key("fk_comic_projects_owner_user_id_users", "users", ["owner_user_id"], ["id"])
        batch_op.create_foreign_key(
            "fk_comic_projects_owner_anonymous_session_id_anonymous_sessions",
            "anonymous_sessions",
            ["owner_anonymous_session_id"],
            ["id"],
        )


def add_comic_task_owner_columns() -> None:
    with op.batch_alter_table("comic_tasks") as batch_op:
        batch_op.add_column(sa.Column("anonymous_session_id", sa.Integer(), nullable=True))
        batch_op.create_index("ix_comic_tasks_anonymous_session_id", ["anonymous_session_id"])
        batch_op.create_foreign_key(
            "fk_comic_tasks_anonymous_session_id_anonymous_sessions",
            "anonymous_sessions",
            ["anonymous_session_id"],
            ["id"],
        )


def drop_comic_task_owner_columns() -> None:
    with op.batch_alter_table("comic_tasks") as batch_op:
        batch_op.drop_constraint("fk_comic_tasks_anonymous_session_id_anonymous_sessions", type_="foreignkey")
        batch_op.drop_index("ix_comic_tasks_anonymous_session_id")
        batch_op.drop_column("anonymous_session_id")


def drop_comic_project_owner_columns() -> None:
    with op.batch_alter_table("comic_projects") as batch_op:
        batch_op.drop_constraint(
            "fk_comic_projects_owner_anonymous_session_id_anonymous_sessions",
            type_="foreignkey",
        )
        batch_op.drop_constraint("fk_comic_projects_owner_user_id_users", type_="foreignkey")
        batch_op.drop_index("ix_comic_projects_owner_anonymous_session_id")
        batch_op.drop_index("ix_comic_projects_owner_user_id")
        batch_op.drop_column("owner_anonymous_session_id")
        batch_op.drop_column("owner_user_id")


def drop_image_job_owner_columns() -> None:
    with op.batch_alter_table("image_jobs") as batch_op:
        batch_op.drop_constraint("fk_image_jobs_anonymous_session_id_anonymous_sessions", type_="foreignkey")
        batch_op.drop_index("ix_image_jobs_anonymous_session_id")
        batch_op.drop_index("ix_image_jobs_user_id")
        batch_op.drop_column("anonymous_session_id")


def drop_asset_owner_columns() -> None:
    with op.batch_alter_table("assets") as batch_op:
        batch_op.drop_constraint("fk_assets_owner_anonymous_session_id_anonymous_sessions", type_="foreignkey")
        batch_op.drop_index("ix_assets_owner_anonymous_session_id")
        batch_op.drop_index("ix_assets_owner_user_id")
        batch_op.drop_column("owner_anonymous_session_id")


def drop_anonymous_sessions_table() -> None:
    op.drop_index("ix_anonymous_sessions_rotated_from_id", table_name="anonymous_sessions")
    op.drop_index("ix_anonymous_sessions_token_hash", table_name="anonymous_sessions")
    op.drop_table("anonymous_sessions")
