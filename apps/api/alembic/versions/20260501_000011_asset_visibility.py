"""add asset visibility

Revision ID: 20260501_000011
Revises: 20260428_000010
Create Date: 2026-05-01 00:00:11
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260501_000011"
down_revision = "20260428_000010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("assets") as batch_op:
        batch_op.add_column(sa.Column("visibility", sa.String(length=16), nullable=False, server_default="private"))
        batch_op.add_column(sa.Column("published_at", sa.DateTime(), nullable=True))
        batch_op.create_index("ix_assets_visibility", ["visibility"])
    with op.batch_alter_table("assets") as batch_op:
        batch_op.alter_column("visibility", server_default=None)
    with op.batch_alter_table("image_jobs") as batch_op:
        batch_op.add_column(sa.Column("visibility", sa.String(length=16), nullable=False, server_default="private"))
    with op.batch_alter_table("image_jobs") as batch_op:
        batch_op.alter_column("visibility", server_default=None)


def downgrade() -> None:
    with op.batch_alter_table("image_jobs") as batch_op:
        batch_op.drop_column("visibility")
    with op.batch_alter_table("assets") as batch_op:
        batch_op.drop_index("ix_assets_visibility")
        batch_op.drop_column("published_at")
        batch_op.drop_column("visibility")
