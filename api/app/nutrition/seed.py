"""Seed the ingredient table with the mock's ingredient list (until USDA/Ciqual import lands).

Run: python -m app.nutrition.seed
"""

import asyncio
from dataclasses import asdict, dataclass, field

from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import SessionLocal
from app.nutrition.models import Ingredient


@dataclass(frozen=True)
class SeedIngredient:
    name: str
    emoji: str
    category: str
    kcal: float
    protein: float
    carbs: float
    fat: float
    fiber: float
    sugar: float
    price_per_100g: float
    shelf_days: int
    aliases: list[str] = field(default_factory=list)


# Per 100 g; values, prices (EUR) and shelf life from index.html.
MOCK_INGREDIENTS = [
    SeedIngredient(
        "Chicken breast",
        "🍗",
        "Meat",
        165,
        31,
        0,
        3.6,
        0,
        0,
        0.9,
        5,
        ["chicken", "grilled chicken"],
    ),
    SeedIngredient(
        "Rice (cooked)",
        "🍚",
        "Pantry",
        130,
        2.7,
        28,
        0.3,
        0.4,
        0,
        0.2,
        60,
        ["rice", "cooked rice", "white rice"],
    ),
    SeedIngredient("Broccoli", "🥦", "Produce", 34, 2.8, 7, 0.4, 2.6, 1.7, 0.35, 6),
    SeedIngredient("Soy sauce", "🫙", "Pantry", 60, 8, 5, 0, 0.8, 0.5, 0.5, 200),
    SeedIngredient(
        "Olive oil", "🫒", "Pantry", 884, 0, 0, 100, 0, 0, 0.8, 300, ["oil", "cooking oil"]
    ),
    SeedIngredient("Salmon", "🐟", "Meat", 208, 20, 0, 13, 0, 0, 2.2, 3, ["salmon fillet"]),
    SeedIngredient(
        "Potatoes",
        "🥔",
        "Produce",
        77,
        2,
        17,
        0.1,
        2.2,
        0.8,
        0.12,
        20,
        ["potato", "boiled potatoes"],
    ),
    SeedIngredient(
        "Spaghetti",
        "🍝",
        "Pantry",
        158,
        5.8,
        31,
        0.9,
        1.8,
        1.1,
        0.2,
        200,
        ["pasta", "cooked pasta", "cooked spaghetti"],
    ),
    SeedIngredient("Tomatoes", "🍅", "Produce", 18, 0.9, 3.9, 0.2, 1.2, 2.6, 0.3, 7, ["tomato"]),
    SeedIngredient(
        "Beef mince", "🥩", "Meat", 250, 26, 0, 15, 0, 0, 1.1, 3, ["ground beef", "minced beef"]
    ),
    SeedIngredient("Parmesan", "🧀", "Dairy", 350, 25, 1, 28, 0, 0, 1.4, 30, ["parmesan cheese"]),
    SeedIngredient(
        "Eggs", "🥚", "Dairy", 143, 13, 1, 10, 0, 0.4, 0.5, 14, ["egg", "fried egg", "boiled egg"]
    ),
    SeedIngredient("Avocado", "🥑", "Produce", 160, 2, 9, 15, 6.7, 0.7, 0.8, 4),
    SeedIngredient(
        "Sourdough", "🍞", "Pantry", 265, 9, 49, 3.2, 2.7, 3, 0.3, 5, ["bread", "sourdough bread"]
    ),
    SeedIngredient("Chickpeas", "🫘", "Pantry", 164, 9, 27, 2.6, 7.6, 3, 0.25, 200, ["chickpea"]),
    SeedIngredient("Spinach", "🥬", "Produce", 23, 2.9, 3.6, 0.4, 2.2, 0.4, 0.4, 4),
    SeedIngredient("Cream", "🥛", "Dairy", 195, 2, 3, 20, 0, 3, 0.5, 10, ["cooking cream"]),
    SeedIngredient(
        "Lentils", "🫘", "Pantry", 116, 9, 20, 0.4, 7.9, 1.8, 0.2, 200, ["lentil", "cooked lentils"]
    ),
    SeedIngredient("Onions", "🧅", "Produce", 40, 1.1, 9, 0.1, 1.7, 4.2, 0.1, 30, ["onion"]),
    SeedIngredient(
        "Rolled oats", "🌾", "Pantry", 389, 17, 66, 7, 10.6, 1, 0.1, 200, ["oats", "oatmeal"]
    ),
    SeedIngredient("Milk", "🥛", "Dairy", 42, 3.4, 5, 1, 0, 5, 0.1, 7),
    SeedIngredient(
        "Canned tomatoes",
        "🥫",
        "Pantry",
        21,
        1.2,
        4,
        0.1,
        1.5,
        0,
        0.15,
        400,
        ["tomato sauce", "chopped tomatoes"],
    ),
    SeedIngredient("Banana", "🍌", "Produce", 89, 1.1, 23, 0.3, 2.6, 12, 0.2, 5),
]


async def seed_mock(session: AsyncSession) -> None:
    rows = [asdict(i) | {"source": "mock"} for i in MOCK_INGREDIENTS]
    stmt = insert(Ingredient).values(rows)
    updatable = {k for k in rows[0] if k not in ("name", "source")}
    stmt = stmt.on_conflict_do_update(
        index_elements=["source", "name"], set_={k: stmt.excluded[k] for k in updatable}
    )
    await session.execute(stmt)
    await session.commit()


async def _main() -> None:
    async with SessionLocal() as session:
        await seed_mock(session)


if __name__ == "__main__":
    asyncio.run(_main())
