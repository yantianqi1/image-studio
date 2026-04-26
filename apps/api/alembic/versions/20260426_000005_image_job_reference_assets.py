from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260426_000005"
down_revision = "20260425_000004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "image_job_reference_assets",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("job_id", sa.Integer(), nullable=False),
        sa.Column("asset_id", sa.Integer(), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["asset_id"], ["assets.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["job_id"], ["image_jobs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("job_id", "asset_id", name="uq_image_job_reference_assets_job_asset"),
    )
    op.create_index("ix_image_job_reference_assets_asset_id", "image_job_reference_assets", ["asset_id"])
    op.create_index("ix_image_job_reference_assets_job_id", "image_job_reference_assets", ["job_id"])


def downgrade() -> None:
    op.drop_index("ix_image_job_reference_assets_job_id", table_name="image_job_reference_assets")
    op.drop_index("ix_image_job_reference_assets_asset_id", table_name="image_job_reference_assets")
    op.drop_table("image_job_reference_assets")
