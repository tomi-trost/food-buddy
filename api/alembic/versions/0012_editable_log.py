"""Log entries remember a snack's values per piece / per 100 g, so its amount can be changed later.

`servings` (0011) is the amount: portions for meals, pieces or grams for snacks.

Revision ID: 0012
Revises: 0011
Create Date: 2026-10-12
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("food_log", sa.Column("per", sa.String(5)))  # piece | 100g (snacks)
    op.add_column("food_log", sa.Column("per_unit", JSONB))
    # Earlier snacks: one piece with the logged values
    op.execute(
        """
        UPDATE food_log SET per = 'piece', servings = 1, per_unit = jsonb_build_object(
            'kcal', kcal, 'protein', protein, 'carbs', carbs,
            'fat', fat, 'fiber', fiber, 'sugar', sugar)
        WHERE kind = 'snack'
        """
    )


def downgrade() -> None:
    op.drop_column("food_log", "per_unit")
    op.drop_column("food_log", "per")
