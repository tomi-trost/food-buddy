"""Weight of one piece of a scanned product (cookies counted instead of weighed).

Revision ID: 0020
Revises: 0019
Create Date: 2026-10-13
"""

import sqlalchemy as sa
from alembic import op

revision = "0020"
down_revision = "0019"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("household_product", sa.Column("piece_g", sa.Float, nullable=True))


def downgrade() -> None:
    op.drop_column("household_product", "piece_g")
