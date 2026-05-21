"""add unique image job result index

Revision ID: 20260520_000030
Revises: 20260520_000029
Create Date: 2026-05-20 00:00:30
"""
from __future__ import annotations

from alembic import op


revision = "20260520_000030"
down_revision = "20260520_000029"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("image_job_results") as batch_op:
        batch_op.create_unique_constraint("uq_image_job_results_job_result", ["job_id", "result_index"])


def downgrade() -> None:
    with op.batch_alter_table("image_job_results") as batch_op:
        batch_op.drop_constraint("uq_image_job_results_job_result", type_="unique")
