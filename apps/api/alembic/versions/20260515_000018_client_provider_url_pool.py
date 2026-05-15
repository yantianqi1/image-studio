"""add client provider url pool to site settings

Revision ID: 20260515_000018
Revises: 20260515_000017
Create Date: 2026-05-15
"""

from alembic import op
import sqlalchemy as sa


revision = "20260515_000018"
down_revision = "20260515_000017"
branch_labels = None
depends_on = None

DEFAULT_CLIENT_PROVIDER_URL_POOL = "https://ws.wdapi.top/v1\nhttps://api.openai.com/v1"


def upgrade() -> None:
    with op.batch_alter_table("site_settings") as batch_op:
        batch_op.add_column(
            sa.Column(
                "client_provider_url_pool",
                sa.Text(),
                nullable=False,
                server_default=DEFAULT_CLIENT_PROVIDER_URL_POOL,
            )
        )


def downgrade() -> None:
    with op.batch_alter_table("site_settings") as batch_op:
        batch_op.drop_column("client_provider_url_pool")
