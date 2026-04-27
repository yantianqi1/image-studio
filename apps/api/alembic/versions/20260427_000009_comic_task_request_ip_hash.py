"""comic task request ip hash

Revision ID: 20260427_000009
Revises: 20260427_000008
Create Date: 2026-04-27 00:00:09
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260427_000009"
down_revision = "20260427_000008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("comic_tasks") as batch_op:
        batch_op.add_column(sa.Column("request_ip_hash", sa.String(length=64), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("comic_tasks") as batch_op:
        batch_op.drop_column("request_ip_hash")
