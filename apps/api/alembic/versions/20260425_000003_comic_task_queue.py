"""add comic task queue fields

Revision ID: 20260425_000003
Revises: 20260425_000002
Create Date: 2026-04-25 00:00:03
"""

from alembic import op
import sqlalchemy as sa

revision = "20260425_000003"
down_revision = "20260425_000002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("comic_tasks") as batch_op:
        batch_op.add_column(sa.Column("stage", sa.String(length=32), nullable=False, server_default="queued"))
        batch_op.add_column(sa.Column("progress_percent", sa.Integer(), nullable=False, server_default="0"))
        batch_op.add_column(sa.Column("error_code", sa.String(length=64), nullable=True))
        batch_op.add_column(sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="0"))
        batch_op.add_column(sa.Column("max_attempts", sa.Integer(), nullable=False, server_default="1"))
        batch_op.add_column(sa.Column("available_at", sa.DateTime(), nullable=False, server_default=sa.func.current_timestamp()))
        batch_op.add_column(sa.Column("locked_by", sa.String(length=128), nullable=True))
        batch_op.add_column(sa.Column("locked_at", sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column("started_at", sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column("finished_at", sa.DateTime(), nullable=True))
        batch_op.create_index("ix_comic_tasks_status_available_at", ["status", "available_at"], unique=False)


def downgrade() -> None:
    with op.batch_alter_table("comic_tasks") as batch_op:
        batch_op.drop_index("ix_comic_tasks_status_available_at")
        batch_op.drop_column("finished_at")
        batch_op.drop_column("started_at")
        batch_op.drop_column("locked_at")
        batch_op.drop_column("locked_by")
        batch_op.drop_column("available_at")
        batch_op.drop_column("max_attempts")
        batch_op.drop_column("attempt_count")
        batch_op.drop_column("error_code")
        batch_op.drop_column("progress_percent")
        batch_op.drop_column("stage")
