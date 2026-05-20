"""add image job queue indexes

Revision ID: 20260520_000027
Revises: 20260518_000026
Create Date: 2026-05-20 00:00:27
"""
from __future__ import annotations

from alembic import op


revision = "20260520_000027"
down_revision = "20260518_000026"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index("ix_image_jobs_queue_pick", "image_jobs", ["status", "available_at", "id"])
    op.create_index("ix_image_jobs_running_started_at", "image_jobs", ["status", "started_at"])


def downgrade() -> None:
    op.drop_index("ix_image_jobs_running_started_at", table_name="image_jobs")
    op.drop_index("ix_image_jobs_queue_pick", table_name="image_jobs")
