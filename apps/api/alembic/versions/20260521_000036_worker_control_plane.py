"""add worker control plane tables

Revision ID: 20260521_000036
Revises: 20260521_000035
Create Date: 2026-05-21 00:00:36
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision = "20260521_000036"
down_revision = "20260521_000035"
branch_labels = None
depends_on = None

BIGINT_PK = sa.BigInteger().with_variant(sa.Integer(), "sqlite")
JSON_PAYLOAD = postgresql.JSONB().with_variant(sa.JSON(), "sqlite")


def upgrade() -> None:
    op.create_table(
        "worker_nodes",
        sa.Column("id", sa.String(length=128), primary_key=True),
        sa.Column("worker_name", sa.String(length=128), nullable=False),
        sa.Column("hostname", sa.String(length=255), nullable=True),
        sa.Column("version", sa.String(length=64), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("mode", sa.String(length=32), nullable=False),
        sa.Column("concurrency", sa.Integer(), nullable=False),
        sa.Column("started_at", sa.DateTime(), nullable=False),
        sa.Column("last_heartbeat_at", sa.DateTime(), nullable=False),
        sa.Column("metadata", JSON_PAYLOAD, nullable=True),
    )
    op.create_index("ix_worker_nodes_status", "worker_nodes", ["status"])
    op.create_index("ix_worker_nodes_last_heartbeat_at", "worker_nodes", ["last_heartbeat_at"])

    op.create_table(
        "worker_runtime_config",
        sa.Column("id", BIGINT_PK, primary_key=True, autoincrement=True),
        sa.Column("config_key", sa.String(length=128), nullable=False, unique=True),
        sa.Column("config_value", JSON_PAYLOAD, nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )

    op.create_table(
        "runtime_ops_events",
        sa.Column("id", BIGINT_PK, primary_key=True, autoincrement=True),
        sa.Column("event_type", sa.String(length=64), nullable=False),
        sa.Column("target_type", sa.String(length=64), nullable=True),
        sa.Column("target_id", sa.String(length=128), nullable=True),
        sa.Column("payload", JSON_PAYLOAD, nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_runtime_ops_events_target", "runtime_ops_events", ["target_type", "target_id"])


def downgrade() -> None:
    op.drop_index("ix_runtime_ops_events_target", table_name="runtime_ops_events")
    op.drop_table("runtime_ops_events")
    op.drop_table("worker_runtime_config")
    op.drop_index("ix_worker_nodes_last_heartbeat_at", table_name="worker_nodes")
    op.drop_index("ix_worker_nodes_status", table_name="worker_nodes")
    op.drop_table("worker_nodes")
