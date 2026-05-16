"""add LLM purpose model settings

Revision ID: 20260516_000023
Revises: 20260516_000022
Create Date: 2026-05-16 00:00:23
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260516_000023"
down_revision = "20260516_000022"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "llm_purpose_model_settings",
        sa.Column("purpose", sa.String(length=64), nullable=False),
        sa.Column("model_code", sa.String(length=128), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["model_code"], ["sellable_models.code"]),
        sa.PrimaryKeyConstraint("purpose"),
    )


def downgrade() -> None:
    op.drop_table("llm_purpose_model_settings")
