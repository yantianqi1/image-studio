"""add image job storage subdir

Revision ID: 20260428_000010
Revises: 20260427_000009
Create Date: 2026-04-28 00:00:10
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260428_000010"
down_revision = "20260427_000009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("image_jobs") as batch_op:
        batch_op.add_column(sa.Column("storage_subdir", sa.String(length=255), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("image_jobs") as batch_op:
        batch_op.drop_column("storage_subdir")
