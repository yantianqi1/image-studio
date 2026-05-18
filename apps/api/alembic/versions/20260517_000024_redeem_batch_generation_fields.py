"""add generated redeem batch fields

Revision ID: 20260517_000024
Revises: 20260517_000023
Create Date: 2026-05-17 00:00:24
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260517_000024"
down_revision = "20260517_000023"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "activation_code_batches",
        sa.Column("status", sa.String(length=32), nullable=False, server_default="active"),
    )
    op.add_column("activation_code_batches", sa.Column("expires_at", sa.DateTime(), nullable=True))
    op.add_column(
        "activation_code_batches",
        sa.Column("note", sa.Text(), nullable=False, server_default=""),
    )


def downgrade() -> None:
    op.drop_column("activation_code_batches", "note")
    op.drop_column("activation_code_batches", "expires_at")
    op.drop_column("activation_code_batches", "status")
