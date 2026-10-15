"""Migration 0022 (decision 0025): saved snacks become product meals, past days linked to them."""

import json

from alembic import command
from alembic.config import Config
from sqlalchemy import select, text

from app.db import engine
from app.logs.models import FoodLog
from app.meals.models import CookLog, Meal
from app.nutrition.models import Ingredient
from tests.conftest import API_DIR, TEST_DATABASE_URL, register

TIRAMISU = {"kcal": 420, "protein": 7, "carbs": 38, "fat": 26, "fiber": 0.5, "sugar": 27}
GRANOLA = {"kcal": 450, "protein": 10, "carbs": 60, "fat": 18, "fiber": 8, "sugar": 20}


def alembic(revision: str, down: bool = False) -> None:
    config = Config(str(API_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(API_DIR / "alembic"))
    config.attributes["database_url"] = TEST_DATABASE_URL
    (command.downgrade if down else command.upgrade)(config, revision)


async def sql(statement: str, **params) -> None:
    async with engine.begin() as conn:
        await conn.execute(text(statement), params)


def food_log(name: str, per: str, servings: float, kcal: float, day: str) -> str:
    return f"""
        INSERT INTO food_log (household_id, user_id, eaten_on, meal_type, name, emoji, kind,
            snack_kind, is_reward, source, servings, per, per_unit, kcal, protein, carbs, fat,
            fiber, sugar)
        VALUES (1, 1, '{day}', 'snack', '{name}', '🍰', 'snack', 'sweet', false, 'saved',
            {servings}, '{per}', '{{}}', {kcal}, 0, 0, 0, 0, 0)
    """


async def test_saved_snacks_become_product_meals(client, session):
    await register(client)  # household 1, user 1
    await engine.dispose()
    alembic("0021", down=True)
    try:
        for name, per, amount, values, photo in [
            ("Tiramisu", "piece", 2, TIRAMISU, "1/t.jpg"),
            ("Granola", "100g", 40, GRANOLA, None),
        ]:
            await sql(
                """
                INSERT INTO saved_snack (household_id, created_by, name, emoji, kind, per, amount,
                    per_unit, photo_path, last_eaten_on)
                VALUES (1, 1, :name, '🍰', 'sweet', :per, :amount, CAST(:values AS jsonb), :photo,
                    '2026-10-10')
                """,
                name=name,
                per=per,
                amount=amount,
                values=json.dumps(values),
                photo=photo,
            )
        await sql(food_log("tiramisu", "piece", 1, 420, "2026-10-09"))
        await sql(food_log("Tiramisu", "piece", 2, 840, "2026-10-10"))
        await sql(food_log("Tiramisu", "100g", 50, 200, "2026-10-11"))  # other unit: not linked
        await sql(
            """
            INSERT INTO household_product (household_id, code, name, kind, per100, per, amount)
            VALUES (1, '4001234567890', 'Granola', 'sweet', '{}', '100g', 40)
            """
        )
        await engine.dispose()
    finally:
        alembic("head")

    meals = {m.name: m for m in await session.scalars(select(Meal))}
    tiramisu, granola = meals["Tiramisu"], meals["Granola"]
    assert (tiramisu.types, tiramisu.is_product, tiramisu.snack_kind) == (["snack"], True, "sweet")
    assert (tiramisu.per, tiramisu.piece_g, tiramisu.photo_path) == ("piece", 30, "1/t.jpg")
    assert (granola.per, granola.piece_g) == ("100g", None)

    [cake] = tiramisu.ingredients
    assert (cake.grams, cake.ingredient.household_id, cake.ingredient.source) == (60, 1, "h1")
    assert round(cake.ingredient.kcal * 30 / 100, 3) == 420  # one piece still 420 kcal
    assert cake.ingredient.unit == "pc"
    [oats] = granola.ingredients
    assert (oats.grams, oats.ingredient.kcal, oats.ingredient.unit) == (40, 450, None)

    logs = list(await session.scalars(select(FoodLog).order_by(FoodLog.eaten_on)))
    assert [entry.meal_id for entry in logs] == [tiramisu.id, tiramisu.id, None]
    cooked = await session.scalars(select(CookLog.cooked_on).where(CookLog.meal_id == tiramisu.id))
    assert sorted(str(d) for d in cooked) == ["2026-10-09", "2026-10-10"]
    linked = await session.scalar(text("SELECT meal_id FROM household_product"))
    assert linked == granola.id
    others = await session.scalars(select(Ingredient).where(Ingredient.household_id.is_(None)))
    assert not [i for i in others if i.name in ("Tiramisu", "Granola")]
