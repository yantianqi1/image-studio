"""remove local billing schema

Revision ID: 20260518_000026
Revises: 20260518_000025
Create Date: 2026-05-18 00:00:26
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260518_000026"
down_revision = "20260518_000025"
branch_labels = None
depends_on = None

POSTGRESQL_DIALECT = "postgresql"
SELLABLE_MODEL_BILLING_COLUMNS = ("anonymous_price_cents", "member_price_cents")
IMAGE_JOB_BILLING_COLUMNS = ("reservation_id", "charge_cents")


def upgrade() -> None:
    op.drop_table("model_variants")
    drop_removed_billing_columns()
    op.drop_table("activation_codes")
    op.drop_table("activation_code_batches")
    op.drop_table("wallet_ledger")
    op.drop_table("wallet_reservations")
    op.drop_table("wallets")


def downgrade() -> None:
    create_wallet_tables()
    create_activation_code_tables()
    restore_removed_billing_columns()
    create_model_variants_table()


def is_postgresql() -> bool:
    return op.get_bind().dialect.name == POSTGRESQL_DIALECT


def drop_removed_billing_columns() -> None:
    drop_columns("sellable_models", SELLABLE_MODEL_BILLING_COLUMNS)
    drop_columns("image_jobs", IMAGE_JOB_BILLING_COLUMNS)


def drop_columns(table_name: str, column_names: tuple[str, ...]) -> None:
    if is_postgresql():
        for column_name in column_names:
            op.drop_column(table_name, column_name)
        return
    with op.batch_alter_table(table_name, recreate="always") as batch_op:
        for column_name in column_names:
            batch_op.drop_column(column_name)


def restore_removed_billing_columns() -> None:
    add_columns("image_jobs", build_image_job_billing_columns())
    add_columns("sellable_models", build_sellable_model_billing_columns())


def add_columns(table_name: str, columns: list[sa.Column]) -> None:
    if is_postgresql():
        for column in columns:
            op.add_column(table_name, column)
        return
    with op.batch_alter_table(table_name, recreate="always") as batch_op:
        for column in columns:
            batch_op.add_column(column)


def build_image_job_billing_columns() -> list[sa.Column]:
    return [
        sa.Column("charge_cents", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("reservation_id", sa.Integer(), sa.ForeignKey("wallet_reservations.id"), nullable=True),
    ]


def build_sellable_model_billing_columns() -> list[sa.Column]:
    return [
        sa.Column("member_price_cents", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("anonymous_price_cents", sa.Integer(), nullable=False, server_default="0"),
    ]


def create_wallet_tables() -> None:
    op.create_table(
        "wallets",
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), primary_key=True),
        sa.Column("balance_cents", sa.Integer(), nullable=False),
        sa.Column("locked_cents", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(length=8), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_table(
        "wallet_reservations",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("amount_cents", sa.Integer(), nullable=False),
        sa.Column("reason", sa.String(length=64), nullable=False),
        sa.Column("reference_type", sa.String(length=64), nullable=False),
        sa.Column("reference_id", sa.String(length=128), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("committed_at", sa.DateTime(), nullable=True),
        sa.Column("released_at", sa.DateTime(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=False),
    )
    op.create_index("ix_wallet_reservations_user_id", "wallet_reservations", ["user_id"])
    op.create_table(
        "wallet_ledger",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("amount_cents", sa.Integer(), nullable=False),
        sa.Column("balance_after_cents", sa.Integer(), nullable=False),
        sa.Column("reason", sa.String(length=64), nullable=False),
        sa.Column("reference_type", sa.String(length=64), nullable=False),
        sa.Column("reference_id", sa.String(length=128), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_wallet_ledger_user_id", "wallet_ledger", ["user_id"])


def create_activation_code_tables() -> None:
    op.create_table(
        "activation_code_batches",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("credit_amount_cents", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="active"),
        sa.Column("expires_at", sa.DateTime(), nullable=True),
        sa.Column("note", sa.Text(), nullable=False, server_default=""),
    )
    op.create_table(
        "activation_codes",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("batch_id", sa.Integer(), sa.ForeignKey("activation_code_batches.id"), nullable=False),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("credit_amount_cents", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("redeemed_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("redeemed_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )


def create_model_variants_table() -> None:
    op.create_table(
        "model_variants",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("model_id", sa.Integer(), sa.ForeignKey("sellable_models.id"), nullable=False),
        sa.Column("size", sa.String(length=64), nullable=False),
        sa.Column("quality", sa.String(length=32), nullable=False),
        sa.Column("upstream_provider_model", sa.String(length=128), nullable=True),
        sa.Column("upstream_cost_credits", sa.Float(), nullable=True),
        sa.Column("upstream_cost_cents", sa.Integer(), nullable=True),
        sa.Column("member_price_credits", sa.Float(), nullable=True),
        sa.Column("member_price_cents", sa.Integer(), nullable=False),
        sa.Column("anonymous_price_cents", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("profit_margin_basis_points", sa.Integer(), nullable=False, server_default="3000"),
        sa.Column("price_manually_set", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_model_variants_model_id", "model_variants", ["model_id"])
