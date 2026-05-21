"""add image job item scheduling fields

Revision ID: 20260520_000031
Revises: 20260520_000030
Create Date: 2026-05-20 00:00:31
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "20260520_000031"
down_revision = "20260520_000030"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("image_job_items") as batch_op:
        batch_op.add_column(sa.Column("priority", sa.Integer(), nullable=False, server_default="0"))
        batch_op.add_column(sa.Column("dead_letter_at", sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column("last_error_code", sa.String(length=64), nullable=True))
        batch_op.add_column(sa.Column("last_error_message", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("manual_retry_count", sa.Integer(), nullable=False, server_default="0"))
        batch_op.create_index(
            "ix_image_job_items_priority_queue_pick",
            ["status", "priority", "available_at", "id"],
        )
        batch_op.create_index("ix_image_job_items_dead_letter_at", ["dead_letter_at"])
        batch_op.create_index("ix_image_job_items_job_status", ["job_id", "status"])


def downgrade() -> None:
    with op.batch_alter_table("image_job_items") as batch_op:
        batch_op.drop_index("ix_image_job_items_job_status")
        batch_op.drop_index("ix_image_job_items_dead_letter_at")
        batch_op.drop_index("ix_image_job_items_priority_queue_pick")
        batch_op.drop_column("manual_retry_count")
        batch_op.drop_column("last_error_message")
        batch_op.drop_column("last_error_code")
        batch_op.drop_column("dead_letter_at")
        batch_op.drop_column("priority")
