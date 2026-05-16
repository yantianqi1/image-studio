"""add gallery image tagging tables

Revision ID: 20260516_000024
Revises: 20260516_000023
Create Date: 2026-05-16 00:00:24
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260516_000024"
down_revision = "20260516_000023"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "image_asset_tagging_jobs",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("asset_id", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("attempt_count", sa.Integer(), nullable=False),
        sa.Column("max_attempts", sa.Integer(), nullable=False),
        sa.Column("model_code", sa.String(length=128), nullable=True),
        sa.Column("provider_model", sa.String(length=128), nullable=True),
        sa.Column("error_code", sa.String(length=64), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("available_at", sa.DateTime(), nullable=False),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("finished_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["asset_id"], ["assets.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("asset_id"),
    )
    op.create_index("ix_image_asset_tagging_jobs_asset_id", "image_asset_tagging_jobs", ["asset_id"])
    op.create_index("ix_image_asset_tagging_jobs_status", "image_asset_tagging_jobs", ["status"])
    op.create_index("ix_image_asset_tagging_jobs_available_at", "image_asset_tagging_jobs", ["available_at"])
    op.create_table(
        "image_asset_tags",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("asset_id", sa.Integer(), nullable=False),
        sa.Column("tag", sa.String(length=64), nullable=False),
        sa.Column("normalized_tag", sa.String(length=64), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["asset_id"], ["assets.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("asset_id", "normalized_tag", name="uq_image_asset_tags_asset_normalized_tag"),
    )
    op.create_index("ix_image_asset_tags_asset_id", "image_asset_tags", ["asset_id"])
    op.create_index("ix_image_asset_tags_normalized_tag", "image_asset_tags", ["normalized_tag"])


def downgrade() -> None:
    op.drop_index("ix_image_asset_tags_normalized_tag", table_name="image_asset_tags")
    op.drop_index("ix_image_asset_tags_asset_id", table_name="image_asset_tags")
    op.drop_table("image_asset_tags")
    op.drop_index("ix_image_asset_tagging_jobs_available_at", table_name="image_asset_tagging_jobs")
    op.drop_index("ix_image_asset_tagging_jobs_status", table_name="image_asset_tagging_jobs")
    op.drop_index("ix_image_asset_tagging_jobs_asset_id", table_name="image_asset_tagging_jobs")
    op.drop_table("image_asset_tagging_jobs")
