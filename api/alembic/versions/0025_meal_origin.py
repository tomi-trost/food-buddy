"""Bought and eaten-out food: meal.origin (home | bought | out), listed in our meals, place.

Revision ID: 0025
Revises: 0024
Create Date: 2026-10-24
"""

import sqlalchemy as sa
from alembic import op

revision = "0025"
down_revision = "0024"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("meal", sa.Column("origin", sa.String(6), nullable=False, server_default="home"))
    op.add_column(
        "meal", sa.Column("listed", sa.Boolean(), nullable=False, server_default=sa.true())
    )
    op.add_column("meal", sa.Column("place", sa.String(80)))
    op.create_check_constraint("meal_origin", "meal", "origin IN ('home', 'bought', 'out')")


def downgrade() -> None:
    op.drop_constraint("meal_origin", "meal")
    for column in ("place", "listed", "origin"):
        op.drop_column("meal", column)
