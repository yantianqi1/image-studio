"""add conversation messages to image jobs

Revision ID: 20260515_000017
Revises: 20260515_000016
Create Date: 2026-05-15 00:00:17
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "20260515_000017"
down_revision = "20260515_000016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("image_jobs") as batch_op:
        batch_op.add_column(sa.Column("conversation_messages", sa.JSON(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("image_jobs") as batch_op:
        batch_op.drop_column("conversation_messages")
