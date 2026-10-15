"""Snacks are meals (decision 0025): snack fields on meals, household-owned product ingredients,
saved snacks moved into product meals.

Revision ID: 0022
Revises: 0021
Create Date: 2026-10-14
"""

import json

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "0022"
down_revision = "0021"
branch_labels = None
depends_on = None

PIECE_G = 30  # saved per piece without a weight: values per piece stay exact
NUTRIENTS = ("kcal", "protein", "carbs", "fat", "fiber", "sugar")


def upgrade() -> None:
    op.add_column("meal", sa.Column("snack_kind", sa.String(10)))
    op.add_column("meal", sa.Column("per", sa.String(8), nullable=False, server_default="portion"))
    op.add_column("meal", sa.Column("piece_g", sa.Float))
    op.add_column(
        "meal", sa.Column("is_product", sa.Boolean, nullable=False, server_default=sa.false())
    )
    op.add_column(
        "ingredient",
        sa.Column("household_id", sa.Integer, sa.ForeignKey("household.id", ondelete="CASCADE")),
    )
    op.add_column("ingredient", sa.Column("unit", sa.String(5)))
    op.add_column("ingredient", sa.Column("unit_grams", sa.Float))
    op.add_column(
        "household_product",
        sa.Column("meal_id", sa.Integer, sa.ForeignKey("meal.id", ondelete="SET NULL")),
    )
    op.alter_column("food_log", "per", type_=sa.String(8))
    _move_saved_snacks(op.get_bind())
    op.drop_table("saved_snack")


def _move_saved_snacks(bind) -> None:
    rows = bind.execute(sa.text("SELECT * FROM saved_snack ORDER BY id")).mappings().all()
    for r in rows:
        values = r["per_unit"] if isinstance(r["per_unit"], dict) else json.loads(r["per_unit"])
        piece_g = PIECE_G if r["per"] == "piece" else None
        per100 = {k: values[k] * 100 / piece_g if piece_g else values[k] for k in NUTRIENTS}
        usual = r["amount"] * piece_g if piece_g else r["amount"]
        ingredient_id = bind.execute(
            sa.text(
                """
                INSERT INTO ingredient (name, aliases, source, kcal, protein, carbs, fat, fiber,
                    sugar, emoji, category, price_per_100g, shelf_days, curated, ref,
                    household_id, unit, unit_grams)
                VALUES (:name, '{}', :source, :kcal, :protein, :carbs, :fat, :fiber, :sugar,
                    :emoji, :category, 0, 7, true, '', :household, :unit, :unit_grams)
                ON CONFLICT (source, name) DO UPDATE SET kcal = EXCLUDED.kcal
                RETURNING id
                """
            ),
            {
                "name": r["name"],
                "source": f"h{r['household_id']}",
                **per100,
                "emoji": r["emoji"],
                "category": "Produce" if r["kind"] == "fruit" else "Pantry",
                "household": r["household_id"],
                "unit": "pc" if piece_g else None,
                "unit_grams": piece_g,
            },
        ).scalar_one()
        meal_id = bind.execute(
            sa.text(
                """
                INSERT INTO meal (household_id, created_by, name, emoji, photo_path, types, tags,
                    prep_minutes, portions, steps, steps_source, snack_kind, per, piece_g,
                    is_product, created_at)
                VALUES (:household, :created_by, :name, :emoji, :photo, ARRAY['snack'], '{}', 1,
                    1, '{}', 'ours', :kind, :per, :piece_g, true, :created_at)
                RETURNING id
                """
            ),
            {
                "household": r["household_id"],
                "created_by": r["created_by"],
                "name": r["name"],
                "emoji": r["emoji"],
                "photo": r["photo_path"],
                "kind": r["kind"],
                "per": "piece" if piece_g else "100g",
                "piece_g": piece_g,
                "created_at": r["created_at"],
            },
        ).scalar_one()
        bind.execute(
            sa.text(
                "INSERT INTO meal_ingredient (meal_id, ingredient_id, grams) VALUES (:m, :i, :g)"
            ),
            {"m": meal_id, "i": ingredient_id, "g": usual},
        )
        # past days with this snack, counted the same way, belong to it; each one was eaten once
        params = {"m": meal_id, "h": r["household_id"], "name": r["name"], "per": r["per"]}
        bind.execute(
            sa.text(
                """
                UPDATE food_log SET meal_id = :m
                WHERE household_id = :h AND kind = 'snack' AND meal_id IS NULL
                  AND lower(name) = lower(:name) AND per = :per AND NOT is_reward
                """
            ),
            params,
        )
        bind.execute(
            sa.text(
                """
                INSERT INTO cook_log (meal_id, user_id, cooked_on, created_at)
                SELECT :m, user_id, eaten_on, created_at FROM food_log WHERE meal_id = :m
                """
            ),
            {"m": meal_id},
        )
        bind.execute(
            sa.text(
                """
                UPDATE household_product SET meal_id = :m
                WHERE household_id = :h AND lower(name) = lower(:name)
                """
            ),
            params,
        )


def downgrade() -> None:
    """Snack meals stay meals (as lunch); products and their own ingredients go."""
    op.create_table(
        "saved_snack",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "household_id",
            sa.Integer,
            sa.ForeignKey("household.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("created_by", sa.Integer, sa.ForeignKey("app_user.id", ondelete="SET NULL")),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("emoji", sa.String(8), nullable=False),
        sa.Column("kind", sa.String(10), nullable=False),
        sa.Column("per", sa.String(5), nullable=False),
        sa.Column("amount", sa.Float, nullable=False),
        sa.Column("per_unit", JSONB, nullable=False),
        sa.Column("photo_path", sa.String(255)),
        sa.Column("last_eaten_on", sa.Date),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index(
        "saved_snack_name", "saved_snack", ["household_id", sa.text("lower(name)")], unique=True
    )
    op.execute("DELETE FROM meal WHERE is_product")
    op.execute(
        "DELETE FROM inventory_item WHERE ingredient_id IN "
        "(SELECT id FROM ingredient WHERE household_id IS NOT NULL)"
    )
    op.execute(
        "DELETE FROM ran_out WHERE ingredient_id IN "
        "(SELECT id FROM ingredient WHERE household_id IS NOT NULL)"
    )
    op.execute(
        "DELETE FROM meal_ingredient WHERE ingredient_id IN "
        "(SELECT id FROM ingredient WHERE household_id IS NOT NULL)"
    )
    op.execute("DELETE FROM ingredient WHERE household_id IS NOT NULL")
    op.execute("UPDATE meal SET types = array_remove(types, 'snack')")
    op.execute("UPDATE meal SET types = ARRAY['lunch'] WHERE cardinality(types) = 0")
    op.execute("UPDATE food_log SET per = 'piece' WHERE per = 'portion'")
    op.alter_column("food_log", "per", type_=sa.String(5))
    op.drop_column("household_product", "meal_id")
    op.drop_column("ingredient", "unit_grams")
    op.drop_column("ingredient", "unit")
    op.drop_column("ingredient", "household_id")
    op.drop_column("meal", "is_product")
    op.drop_column("meal", "piece_g")
    op.drop_column("meal", "per")
    op.drop_column("meal", "snack_kind")
