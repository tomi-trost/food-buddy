"""Aliases: what a photo called something we swapped for one of our dishes ("pancakes").

Revision ID: 0030
Revises: 0029
Create Date: 2026-10-24
"""

import sqlalchemy as sa
from alembic import op

revision = "0030"
down_revision = "0029"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "meal_alias",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "meal_id", sa.Integer, sa.ForeignKey("meal.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("name", sa.String(80), nullable=False),  # lower case, single spaces
        # "No" on the check screen in a row; offered again only after a swap
        sa.Column("declined", sa.Integer, nullable=False, server_default="0"),
        sa.UniqueConstraint("meal_id", "name"),
    )


def downgrade() -> None:
    op.drop_table("meal_alias")
