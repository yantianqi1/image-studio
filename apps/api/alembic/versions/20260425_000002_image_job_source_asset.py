"""add source asset to image jobs

Revision ID: 20260425_000002
Revises: 20260424_000001
Create Date: 2026-04-25 00:00:02
"""

from alembic import op
import sqlalchemy as sa

revision = "20260425_000002"
down_revision = "20260424_000001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("image_jobs") as batch_op:
        batch_op.add_column(sa.Column("source_asset_id", sa.Integer(), nullable=True))
        batch_op.create_foreign_key("fk_image_jobs_source_asset_id_assets", "assets", ["source_asset_id"], ["id"])


def downgrade() -> None:
    with op.batch_alter_table("image_jobs") as batch_op:
        batch_op.drop_constraint("fk_image_jobs_source_asset_id_assets", type_="foreignkey")
        batch_op.drop_column("source_asset_id")
