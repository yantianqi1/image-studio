"""add llm feature model settings

Revision ID: 20260517_000023
Revises: 20260516_000022
Create Date: 2026-05-17 00:00:23
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260517_000023"
down_revision = "20260516_000022"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "llm_feature_model_settings",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("feature_key", sa.String(length=64), nullable=False),
        sa.Column("model_code", sa.String(length=128), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["model_code"], ["sellable_models.code"]),
        sa.UniqueConstraint("feature_key", name="uq_llm_feature_model_settings_feature_key"),
    )


def downgrade() -> None:
    op.drop_table("llm_feature_model_settings")
