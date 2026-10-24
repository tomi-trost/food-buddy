"""How a household counts an ingredient (grams, pieces, ml), picked in the app.

Revision ID: 0028
Revises: 0027
Create Date: 2026-10-24
"""

import sqlalchemy as sa
from alembic import op

revision = "0028"
down_revision = "0027"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "household_unit",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "household_id",
            sa.Integer,
            sa.ForeignKey("household.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "ingredient_id",
            sa.Integer,
            sa.ForeignKey("ingredient.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("unit", sa.String(5), nullable=False),
        sa.Column("unit_grams", sa.Float, nullable=False),
        sa.UniqueConstraint("household_id", "ingredient_id"),
        sa.CheckConstraint("unit IN ('g', 'pc', 'ml') AND unit_grams > 0"),
    )


def downgrade() -> None:
    op.drop_table("household_unit")
