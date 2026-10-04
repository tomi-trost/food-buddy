"""Meals, meal ingredients, cook log, food log, inventory and ran-out list.

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-04
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def _fk(table: str, ondelete: str = "CASCADE") -> sa.ForeignKey:
    return sa.ForeignKey(f"{table}.id", ondelete=ondelete)


def _created() -> sa.Column:
    return sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now())


def upgrade() -> None:
    op.create_table(
        "meal",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("household_id", sa.Integer, _fk("household"), nullable=False),
        sa.Column("created_by", sa.Integer, _fk("app_user", "SET NULL")),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("emoji", sa.String(8), nullable=False, server_default="🍽️"),
        sa.Column("photo_path", sa.String(255)),
        sa.Column("types", postgresql.ARRAY(sa.String(10)), nullable=False),
        sa.Column("tags", postgresql.ARRAY(sa.String(30)), nullable=False, server_default="{}"),
        sa.Column("prep_minutes", sa.Integer, nullable=False),
        sa.Column("portions", sa.Integer, nullable=False),
        sa.Column("cost", sa.Float),
        sa.Column("steps", postgresql.ARRAY(sa.Text), nullable=False, server_default="{}"),
        sa.Column("steps_source", sa.String(10), nullable=False, server_default="template"),
        _created(),
    )
    op.create_index("ix_meal_household", "meal", ["household_id"])
    op.create_table(
        "meal_ingredient",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("meal_id", sa.Integer, _fk("meal"), nullable=False),
        sa.Column("ingredient_id", sa.Integer, _fk("ingredient", "RESTRICT"), nullable=False),
        sa.Column("grams", sa.Float, nullable=False),
        sa.UniqueConstraint("meal_id", "ingredient_id"),
    )
    op.create_table(
        "cook_log",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("meal_id", sa.Integer, _fk("meal"), nullable=False),
        sa.Column("user_id", sa.Integer, _fk("app_user"), nullable=False),
        sa.Column("cooked_on", sa.Date, nullable=False),
        _created(),
    )
    op.create_index("ix_cook_log_meal", "cook_log", ["meal_id", "cooked_on"])
    op.create_table(
        "food_log",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("household_id", sa.Integer, _fk("household"), nullable=False),
        sa.Column("user_id", sa.Integer, _fk("app_user"), nullable=False),
        sa.Column("eaten_on", sa.Date, nullable=False),
        sa.Column("meal_type", sa.String(10), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("emoji", sa.String(8), nullable=False, server_default=""),
        sa.Column("meal_id", sa.Integer, _fk("meal", "SET NULL")),
        sa.Column("kind", sa.String(10), nullable=False, server_default="meal"),
        sa.Column("snack_kind", sa.String(10)),
        sa.Column("is_reward", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("source", sa.String(10), nullable=False),
        *[
            sa.Column(n, sa.Float, nullable=False, server_default="0")
            for n in ("kcal", "protein", "carbs", "fat", "fiber", "sugar")
        ],
        _created(),
    )
    op.create_index("ix_food_log_user_day", "food_log", ["user_id", "eaten_on"])
    op.create_table(
        "inventory_item",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("household_id", sa.Integer, _fk("household"), nullable=False),
        sa.Column("ingredient_id", sa.Integer, _fk("ingredient", "RESTRICT"), nullable=False),
        sa.Column("grams", sa.Float, nullable=False),
        sa.Column("expires_on", sa.Date, nullable=False),
        sa.UniqueConstraint("household_id", "ingredient_id"),
    )
    op.create_table(
        "ran_out",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("household_id", sa.Integer, _fk("household"), nullable=False),
        sa.Column("ingredient_id", sa.Integer, _fk("ingredient", "RESTRICT"), nullable=False),
        _created(),
        sa.UniqueConstraint("household_id", "ingredient_id"),
    )
    op.add_column("analysis_job", sa.Column("meal_id", sa.Integer, _fk("meal", "SET NULL")))


def downgrade() -> None:
    op.drop_column("analysis_job", "meal_id")
    for table in ("ran_out", "inventory_item", "food_log", "cook_log", "meal_ingredient", "meal"):
        op.drop_table(table)
