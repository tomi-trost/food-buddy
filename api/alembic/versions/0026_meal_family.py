"""Dish families: the one we picked for a meal (empty = guessed from its name and ingredients).

Revision ID: 0026
Revises: 0025
Create Date: 2026-10-24
"""

import sqlalchemy as sa
from alembic import op

revision = "0026"
down_revision = "0025"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("meal", sa.Column("family", sa.String(40)))


def downgrade() -> None:
    op.drop_column("meal", "family")
