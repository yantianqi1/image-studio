"""add character library entries

Revision ID: 20260515_000019
Revises: 20260515_000018
Create Date: 2026-05-15
"""

from alembic import op
import sqlalchemy as sa


revision = "20260515_000019"
down_revision = "20260515_000018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "character_library_entries",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("asset_id", sa.Integer(), sa.ForeignKey("assets.id", ondelete="CASCADE"), nullable=False),
        sa.Column("visibility", sa.String(length=16), nullable=False),
        sa.Column("owner_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_by_admin_user_id", sa.Integer(), sa.ForeignKey("admin_users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_character_library_entries_asset_id", "character_library_entries", ["asset_id"])
    op.create_index("ix_character_library_entries_visibility", "character_library_entries", ["visibility"])
    op.create_index("ix_character_library_entries_owner_user_id", "character_library_entries", ["owner_user_id"])
    op.create_index(
        "ix_character_library_entries_created_by_admin_user_id",
        "character_library_entries",
        ["created_by_admin_user_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_character_library_entries_created_by_admin_user_id", table_name="character_library_entries")
    op.drop_index("ix_character_library_entries_owner_user_id", table_name="character_library_entries")
    op.drop_index("ix_character_library_entries_visibility", table_name="character_library_entries")
    op.drop_index("ix_character_library_entries_asset_id", table_name="character_library_entries")
    op.drop_table("character_library_entries")
