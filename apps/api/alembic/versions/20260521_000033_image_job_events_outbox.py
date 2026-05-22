"""add image job events and outbox

Revision ID: 20260521_000033
Revises: 20260521_000032
Create Date: 2026-05-21 00:00:33
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision = "20260521_000033"
down_revision = "20260521_000032"
branch_labels = None
depends_on = None

BIGINT_PK = sa.BigInteger().with_variant(sa.Integer(), "sqlite")
JSON_PAYLOAD = postgresql.JSONB().with_variant(sa.JSON(), "sqlite")


def upgrade() -> None:
    op.create_table(
        "image_job_events",
        sa.Column("id", BIGINT_PK, primary_key=True, autoincrement=True),
        sa.Column("job_id", sa.Integer(), sa.ForeignKey("image_jobs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("item_id", sa.Integer(), sa.ForeignKey("image_job_items.id", ondelete="SET NULL"), nullable=True),
        sa.Column("event_type", sa.String(length=64), nullable=False),
        sa.Column("payload", JSON_PAYLOAD, nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_image_job_events_job_id_id", "image_job_events", ["job_id", "id"])
    op.create_index("ix_image_job_events_event_type", "image_job_events", ["event_type"])

    op.create_table(
        "outbox_events",
        sa.Column("id", BIGINT_PK, primary_key=True, autoincrement=True),
        sa.Column("aggregate_type", sa.String(length=64), nullable=False),
        sa.Column("aggregate_id", sa.String(length=128), nullable=False),
        sa.Column("event_type", sa.String(length=64), nullable=False),
        sa.Column("payload", JSON_PAYLOAD, nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="pending"),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("available_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("processed_at", sa.DateTime(), nullable=True),
    )
    op.create_index(
        "ix_outbox_events_status_available_at_id",
        "outbox_events",
        ["status", "available_at", "id"],
    )
    op.create_index("ix_outbox_events_aggregate", "outbox_events", ["aggregate_type", "aggregate_id"])


def downgrade() -> None:
    op.drop_index("ix_outbox_events_aggregate", table_name="outbox_events")
    op.drop_index("ix_outbox_events_status_available_at_id", table_name="outbox_events")
    op.drop_table("outbox_events")
    op.drop_index("ix_image_job_events_event_type", table_name="image_job_events")
    op.drop_index("ix_image_job_events_job_id_id", table_name="image_job_events")
    op.drop_table("image_job_events")
