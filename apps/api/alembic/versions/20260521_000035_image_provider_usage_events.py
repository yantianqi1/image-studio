"""add image provider usage events

Revision ID: 20260521_000035
Revises: 20260521_000034
Create Date: 2026-05-21
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260521_000035"
down_revision = "20260521_000034"
branch_labels = None
depends_on = None


def event_id_type():
    return sa.BigInteger().with_variant(sa.Integer(), "sqlite")


def upgrade() -> None:
    op.create_table(
        "image_provider_usage_events",
        sa.Column("id", event_id_type(), primary_key=True, autoincrement=True),
        sa.Column("job_id", sa.BigInteger(), nullable=False),
        sa.Column("item_id", sa.BigInteger(), nullable=True),
        sa.Column("provider_id", sa.BigInteger(), nullable=True),
        sa.Column("provider_name", sa.String(length=128), nullable=True),
        sa.Column("provider_model", sa.String(length=128), nullable=True),
        sa.Column("input_tokens", sa.Integer(), nullable=True),
        sa.Column("output_tokens", sa.Integer(), nullable=True),
        sa.Column("total_tokens", sa.Integer(), nullable=True),
        sa.Column("raw_provider_cost_cents", sa.Integer(), nullable=True),
        sa.Column("provider_fee_cents", sa.Integer(), nullable=True),
        sa.Column("internal_cost_cents", sa.Integer(), nullable=True),
        sa.Column("raw_payload", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_image_provider_usage_events_job_id", "image_provider_usage_events", ["job_id"])
    op.create_index("ix_image_provider_usage_events_item_id", "image_provider_usage_events", ["item_id"])
    op.create_index("ix_image_provider_usage_events_provider_id", "image_provider_usage_events", ["provider_id"])


def downgrade() -> None:
    op.drop_index("ix_image_provider_usage_events_provider_id", table_name="image_provider_usage_events")
    op.drop_index("ix_image_provider_usage_events_item_id", table_name="image_provider_usage_events")
    op.drop_index("ix_image_provider_usage_events_job_id", table_name="image_provider_usage_events")
    op.drop_table("image_provider_usage_events")
