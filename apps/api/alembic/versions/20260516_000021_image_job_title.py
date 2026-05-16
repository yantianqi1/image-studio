"""add title to image jobs

Revision ID: 20260516_000021
Revises: 20260515_000020
Create Date: 2026-05-16 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "20260516_000021"
down_revision = "20260515_000020"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("image_jobs") as batch_op:
        batch_op.add_column(sa.Column("title", sa.String(length=32), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("image_jobs") as batch_op:
        batch_op.drop_column("title")
