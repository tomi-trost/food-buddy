"""Meals can override their nutrition per portion; food-log entries remember how many portions,
so editing a meal updates the days it was eaten.

Revision ID: 0011
Revises: 0010
Create Date: 2026-10-12
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("meal", sa.Column("nutrients_override", JSONB))
    op.add_column("food_log", sa.Column("servings", sa.Float, nullable=False, server_default="1"))
    # Existing meal entries: portions eaten = logged kcal / the meal's kcal per portion
    op.execute(
        """
        UPDATE food_log f SET servings = round((f.kcal / p.kcal)::numeric, 2)
        FROM (
            SELECT m.id, sum(i.kcal * mi.grams / 100) / m.portions AS kcal
            FROM meal m
            JOIN meal_ingredient mi ON mi.meal_id = m.id
            JOIN ingredient i ON i.id = mi.ingredient_id
            GROUP BY m.id, m.portions
        ) p
        WHERE f.meal_id = p.id AND f.kind = 'meal' AND p.kcal > 0 AND f.kcal > 0
        """
    )


def downgrade() -> None:
    op.drop_column("food_log", "servings")
    op.drop_column("meal", "nutrients_override")
