"""add variant upstream cost and profit margin

Revision ID: 20260516_000022
Revises: 20260516_000021
Create Date: 2026-05-16 00:00:22
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260516_000022"
down_revision = "20260516_000021"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("model_variants", sa.Column("upstream_cost_credits", sa.Float, nullable=True))
    op.add_column("model_variants", sa.Column("upstream_cost_cents", sa.Integer, nullable=True))
    op.add_column(
        "model_variants",
        sa.Column("profit_margin_basis_points", sa.Integer, nullable=False, server_default="3000"),
    )


def downgrade() -> None:
    op.drop_column("model_variants", "profit_margin_basis_points")
    op.drop_column("model_variants", "upstream_cost_cents")
    op.drop_column("model_variants", "upstream_cost_credits")
