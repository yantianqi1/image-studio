"""add admin action logs

Revision ID: 20260518_000025
Revises: 20260517_000024
Create Date: 2026-05-18 00:00:25
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260518_000025"
down_revision = "20260517_000024"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "admin_action_logs",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("admin_user_id", sa.Integer(), sa.ForeignKey("admin_users.id"), nullable=False),
        sa.Column("action", sa.String(length=64), nullable=False),
        sa.Column("target_type", sa.String(length=64), nullable=False),
        sa.Column("target_id", sa.String(length=64), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("metadata", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_admin_action_logs_admin_user_id", "admin_action_logs", ["admin_user_id"])
    op.create_index("ix_admin_action_logs_action", "admin_action_logs", ["action"])
    op.create_index("ix_admin_action_logs_target_type", "admin_action_logs", ["target_type"])
    op.create_index("ix_admin_action_logs_target_id", "admin_action_logs", ["target_id"])
    op.create_index("ix_admin_action_logs_created_at", "admin_action_logs", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_admin_action_logs_created_at", table_name="admin_action_logs")
    op.drop_index("ix_admin_action_logs_target_id", table_name="admin_action_logs")
    op.drop_index("ix_admin_action_logs_target_type", table_name="admin_action_logs")
    op.drop_index("ix_admin_action_logs_action", table_name="admin_action_logs")
    op.drop_index("ix_admin_action_logs_admin_user_id", table_name="admin_action_logs")
    op.drop_table("admin_action_logs")
