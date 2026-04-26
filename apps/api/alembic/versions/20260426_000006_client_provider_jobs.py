from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260426_000006"
down_revision = "20260426_000005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("assets") as batch_op:
        batch_op.add_column(sa.Column("owner_client_id", sa.String(length=128), nullable=True))
        batch_op.create_index("ix_assets_owner_client_id", ["owner_client_id"])
    with op.batch_alter_table("image_jobs") as batch_op:
        batch_op.add_column(sa.Column("client_access_id", sa.String(length=128), nullable=True))
        batch_op.add_column(sa.Column("client_provider_config", sa.JSON(), nullable=True))
        batch_op.create_index("ix_image_jobs_client_access_id", ["client_access_id"])
    with op.batch_alter_table("comic_tasks") as batch_op:
        batch_op.add_column(sa.Column("user_id", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("client_access_id", sa.String(length=128), nullable=True))
        batch_op.add_column(sa.Column("client_provider_config", sa.JSON(), nullable=True))
        batch_op.create_index("ix_comic_tasks_user_id", ["user_id"])
        batch_op.create_index("ix_comic_tasks_client_access_id", ["client_access_id"])
        batch_op.create_foreign_key("fk_comic_tasks_user_id_users", "users", ["user_id"], ["id"])


def downgrade() -> None:
    with op.batch_alter_table("comic_tasks") as batch_op:
        batch_op.drop_constraint("fk_comic_tasks_user_id_users", type_="foreignkey")
        batch_op.drop_index("ix_comic_tasks_client_access_id")
        batch_op.drop_index("ix_comic_tasks_user_id")
        batch_op.drop_column("client_provider_config")
        batch_op.drop_column("client_access_id")
        batch_op.drop_column("user_id")
    with op.batch_alter_table("image_jobs") as batch_op:
        batch_op.drop_index("ix_image_jobs_client_access_id")
        batch_op.drop_column("client_provider_config")
        batch_op.drop_column("client_access_id")
    with op.batch_alter_table("assets") as batch_op:
        batch_op.drop_index("ix_assets_owner_client_id")
        batch_op.drop_column("owner_client_id")
