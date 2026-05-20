"""add image job lease fields

Revision ID: 20260520_000028
Revises: 20260520_000027
Create Date: 2026-05-20 00:00:28
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "20260520_000028"
down_revision = "20260520_000027"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("image_jobs", sa.Column("locked_by", sa.String(length=128), nullable=True))
    op.add_column("image_jobs", sa.Column("locked_at", sa.DateTime(), nullable=True))
    op.add_column("image_jobs", sa.Column("lease_expires_at", sa.DateTime(), nullable=True))
    op.add_column("image_jobs", sa.Column("heartbeat_at", sa.DateTime(), nullable=True))
    op.create_index("ix_image_jobs_running_lease", "image_jobs", ["status", "lease_expires_at"])
    op.create_index("ix_image_jobs_locked_by", "image_jobs", ["locked_by"])


def downgrade() -> None:
    op.drop_index("ix_image_jobs_locked_by", table_name="image_jobs")
    op.drop_index("ix_image_jobs_running_lease", table_name="image_jobs")
    op.drop_column("image_jobs", "heartbeat_at")
    op.drop_column("image_jobs", "lease_expires_at")
    op.drop_column("image_jobs", "locked_at")
    op.drop_column("image_jobs", "locked_by")
