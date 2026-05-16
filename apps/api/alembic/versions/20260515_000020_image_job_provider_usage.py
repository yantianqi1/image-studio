"""add provider usage fields to image jobs

Revision ID: 20260515_000020
Revises: 20260515_000019
Create Date: 2026-05-15
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260515_000020"
down_revision = "20260515_000019"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("image_jobs") as batch_op:
        batch_op.add_column(sa.Column("provider_input_tokens", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("provider_output_tokens", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("provider_total_tokens", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("raw_provider_cost_cents", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("provider_fee_cents", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("internal_cost_cents", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("provider_usage", sa.JSON(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("image_jobs") as batch_op:
        batch_op.drop_column("provider_usage")
        batch_op.drop_column("internal_cost_cents")
        batch_op.drop_column("provider_fee_cents")
        batch_op.drop_column("raw_provider_cost_cents")
        batch_op.drop_column("provider_total_tokens")
        batch_op.drop_column("provider_output_tokens")
        batch_op.drop_column("provider_input_tokens")
