"""add member_price_credits to model_variants

Revision ID: 20260514_000015
Revises: 20260513_000014
Create Date: 2026-05-14 00:00:15
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260514_000015"
down_revision = "20260513_000014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("model_variants", sa.Column("member_price_credits", sa.Float, nullable=True))
    op.add_column("model_variants", sa.Column("price_manually_set", sa.Boolean, nullable=False, server_default="0"))


def downgrade() -> None:
    op.drop_column("model_variants", "price_manually_set")
    op.drop_column("model_variants", "member_price_credits")
