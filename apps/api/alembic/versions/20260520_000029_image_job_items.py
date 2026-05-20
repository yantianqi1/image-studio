"""add image job items

Revision ID: 20260520_000029
Revises: 20260520_000028
Create Date: 2026-05-20 00:00:29
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "20260520_000029"
down_revision = "20260520_000028"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "image_job_items",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("job_id", sa.Integer(), sa.ForeignKey("image_jobs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("result_index", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="queued"),
        sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("max_attempts", sa.Integer(), nullable=False, server_default="3"),
        sa.Column("available_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("finished_at", sa.DateTime(), nullable=True),
        sa.Column("locked_by", sa.String(length=128), nullable=True),
        sa.Column("locked_at", sa.DateTime(), nullable=True),
        sa.Column("heartbeat_at", sa.DateTime(), nullable=True),
        sa.Column("lease_expires_at", sa.DateTime(), nullable=True),
        sa.Column("asset_id", sa.Integer(), sa.ForeignKey("assets.id", ondelete="SET NULL"), nullable=True),
        sa.Column("error_code", sa.String(length=64), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_image_job_items_job_id", "image_job_items", ["job_id"])
    op.create_index("ix_image_job_items_queue_pick", "image_job_items", ["status", "available_at", "id"])
    op.create_index("ix_image_job_items_job_result", "image_job_items", ["job_id", "result_index"])
    op.create_index("ix_image_job_items_running_lease", "image_job_items", ["status", "lease_expires_at"])


def downgrade() -> None:
    op.drop_index("ix_image_job_items_running_lease", table_name="image_job_items")
    op.drop_index("ix_image_job_items_job_result", table_name="image_job_items")
    op.drop_index("ix_image_job_items_queue_pick", table_name="image_job_items")
    op.drop_index("ix_image_job_items_job_id", table_name="image_job_items")
    op.drop_table("image_job_items")
