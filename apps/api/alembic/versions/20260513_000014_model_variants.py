"""add model_variants table

Revision ID: 20260513_000014
Revises: 20260513_000013
Create Date: 2026-05-13 00:00:14
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260513_000014"
down_revision = "20260513_000013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "model_variants",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("model_id", sa.Integer, sa.ForeignKey("sellable_models.id"), nullable=False),
        sa.Column("size", sa.String(64), nullable=False),
        sa.Column("quality", sa.String(32), nullable=False),
        sa.Column("upstream_provider_model", sa.String(128), nullable=True),
        sa.Column("member_price_cents", sa.Integer, nullable=False),
        sa.Column("anonymous_price_cents", sa.Integer, nullable=False, server_default="0"),
        sa.Column("status", sa.String(32), nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("model_id", "size", "quality", name="uq_model_variants_model_size_quality"),
    )
    op.create_index("ix_model_variants_model_id", "model_variants", ["model_id"])


def downgrade() -> None:
    op.drop_index("ix_model_variants_model_id")
    op.drop_table("model_variants")
