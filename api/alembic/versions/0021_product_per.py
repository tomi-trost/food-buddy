"""Scanned products counted in ml (drinks): values and usual amount per 100 ml / ml.

Revision ID: 0021
Revises: 0020
Create Date: 2026-10-14
"""

import sqlalchemy as sa
from alembic import op

revision = "0021"
down_revision = "0020"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "household_product",
        sa.Column("per", sa.String(5), nullable=False, server_default="100g"),
    )


def downgrade() -> None:
    op.drop_column("household_product", "per")
