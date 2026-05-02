"""add sellable model status

Revision ID: 20260502_000012
Revises: 20260501_000011
Create Date: 2026-05-02 00:00:12
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260502_000012"
down_revision = "20260501_000011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("sellable_models") as batch_op:
        batch_op.add_column(sa.Column("status", sa.String(length=32), nullable=False, server_default="active"))
        batch_op.create_index("ix_sellable_models_status", ["status"])
    with op.batch_alter_table("sellable_models") as batch_op:
        batch_op.alter_column("status", server_default=None)


def downgrade() -> None:
    with op.batch_alter_table("sellable_models") as batch_op:
        batch_op.drop_index("ix_sellable_models_status")
        batch_op.drop_column("status")
