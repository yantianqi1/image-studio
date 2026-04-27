"""public shared quota

Revision ID: 20260427_000008
Revises: 20260427_000007
Create Date: 2026-04-27 00:00:08
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260427_000008"
down_revision = "20260427_000007"
branch_labels = None
depends_on = None

DEFAULT_PUBLIC_QUOTA_MODE = "daily_global"
DEFAULT_PUBLIC_QUOTA_LIMIT = "20"


def upgrade() -> None:
    add_settings_columns()
    create_public_quota_buckets_table()
    create_public_quota_usages_table()


def downgrade() -> None:
    op.drop_table("public_quota_usages")
    op.drop_table("public_quota_buckets")
    drop_settings_columns()


def add_settings_columns() -> None:
    with op.batch_alter_table("site_settings") as batch_op:
        batch_op.add_column(
            sa.Column(
                "public_quota_mode",
                sa.String(length=32),
                nullable=False,
                server_default=DEFAULT_PUBLIC_QUOTA_MODE,
            )
        )
        batch_op.add_column(
            sa.Column(
                "public_quota_daily_global_limit",
                sa.Integer(),
                nullable=False,
                server_default=DEFAULT_PUBLIC_QUOTA_LIMIT,
            )
        )
        batch_op.add_column(
            sa.Column(
                "public_quota_per_ip_limit",
                sa.Integer(),
                nullable=False,
                server_default=DEFAULT_PUBLIC_QUOTA_LIMIT,
            )
        )


def drop_settings_columns() -> None:
    with op.batch_alter_table("site_settings") as batch_op:
        batch_op.drop_column("public_quota_per_ip_limit")
        batch_op.drop_column("public_quota_daily_global_limit")
        batch_op.drop_column("public_quota_mode")


def create_public_quota_buckets_table() -> None:
    op.create_table(
        "public_quota_buckets",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("quota_mode", sa.String(length=32), nullable=False),
        sa.Column("quota_key", sa.String(length=128), nullable=False),
        sa.Column("used_count", sa.Integer(), nullable=False),
        sa.Column("limit_count", sa.Integer(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("quota_mode", "quota_key", name="uq_public_quota_buckets_mode_key"),
    )
    op.create_index("ix_public_quota_buckets_quota_mode", "public_quota_buckets", ["quota_mode"])
    op.create_index("ix_public_quota_buckets_quota_key", "public_quota_buckets", ["quota_key"])


def create_public_quota_usages_table() -> None:
    op.create_table(
        "public_quota_usages",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("bucket_id", sa.Integer(), sa.ForeignKey("public_quota_buckets.id"), nullable=False),
        sa.Column("feature", sa.String(length=32), nullable=False),
        sa.Column("units", sa.Integer(), nullable=False),
        sa.Column("reference_type", sa.String(length=64), nullable=False),
        sa.Column("reference_id", sa.String(length=128), nullable=False),
        sa.Column("request_ip_hash", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_public_quota_usages_bucket_id", "public_quota_usages", ["bucket_id"])
    op.create_index("ix_public_quota_usages_feature", "public_quota_usages", ["feature"])
    op.create_index("ix_public_quota_usages_request_ip_hash", "public_quota_usages", ["request_ip_hash"])
