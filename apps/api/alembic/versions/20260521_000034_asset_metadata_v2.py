"""add asset metadata v2 fields

Revision ID: 20260521_000034
Revises: 20260521_000033
Create Date: 2026-05-21 00:00:34
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "20260521_000034"
down_revision = "20260521_000033"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("assets") as batch_op:
        batch_op.add_column(sa.Column("size_bytes", sa.BigInteger(), nullable=True))
        batch_op.add_column(sa.Column("sha256", sa.String(length=64), nullable=True))
        batch_op.add_column(sa.Column("width", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("height", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("storage_backend", sa.String(length=32), nullable=False, server_default="local"))
        batch_op.add_column(sa.Column("thumbnail_storage_path", sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column("deleted_at", sa.DateTime(), nullable=True))
        batch_op.create_index("ix_assets_deleted_at", ["deleted_at"])


def downgrade() -> None:
    with op.batch_alter_table("assets") as batch_op:
        batch_op.drop_index("ix_assets_deleted_at")
        batch_op.drop_column("deleted_at")
        batch_op.drop_column("thumbnail_storage_path")
        batch_op.drop_column("storage_backend")
        batch_op.drop_column("height")
        batch_op.drop_column("width")
        batch_op.drop_column("sha256")
        batch_op.drop_column("size_bytes")
