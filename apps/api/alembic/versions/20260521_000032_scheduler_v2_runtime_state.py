"""add scheduler v2 runtime state

Revision ID: 20260521_000032
Revises: 20260520_000031
Create Date: 2026-05-21 00:00:32
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "20260521_000032"
down_revision = "20260520_000031"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("image_job_items") as batch_op:
        batch_op.add_column(sa.Column("scheduler_score", sa.Integer(), nullable=False, server_default="0"))
        batch_op.add_column(sa.Column("cancelled_at", sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column("cancel_reason", sa.Text(), nullable=True))
        batch_op.create_index(
            "ix_image_job_items_scheduler_queue_pick",
            ["status", "priority", "scheduler_score", "available_at", "id"],
        )

    op.create_table(
        "provider_runtime_state",
        sa.Column("provider_id", sa.Integer(), sa.ForeignKey("providers.id"), primary_key=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="healthy"),
        sa.Column("failure_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_failure_at", sa.DateTime(), nullable=True),
        sa.Column("circuit_open_until", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )


def downgrade() -> None:
    op.drop_table("provider_runtime_state")

    with op.batch_alter_table("image_job_items") as batch_op:
        batch_op.drop_index("ix_image_job_items_scheduler_queue_pick")
        batch_op.drop_column("cancel_reason")
        batch_op.drop_column("cancelled_at")
        batch_op.drop_column("scheduler_score")
