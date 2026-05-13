"""add size and quality to image_jobs

Revision ID: 20260513_000013
Revises: 20260502_000012
Create Date: 2026-05-13 00:00:13
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260513_000013"
down_revision = "20260502_000012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("image_jobs") as batch_op:
        batch_op.add_column(sa.Column("size", sa.String(length=32), nullable=True))
        batch_op.add_column(sa.Column("quality", sa.String(length=16), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("image_jobs") as batch_op:
        batch_op.drop_column("quality")
        batch_op.drop_column("size")
