"""add trigram index on image_jobs.prompt for gallery search

Revision ID: 20260515_000016
Revises: 20260514_000015
Create Date: 2026-05-15 00:00:16
"""
from __future__ import annotations

from alembic import op


revision = "20260515_000016"
down_revision = "20260514_000015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
        op.execute(
            "CREATE INDEX ix_image_jobs_prompt_trgm ON image_jobs "
            "USING gin (prompt gin_trgm_ops)"
        )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("DROP INDEX IF EXISTS ix_image_jobs_prompt_trgm")
