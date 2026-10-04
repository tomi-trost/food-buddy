"""Seed the ingredient table with the mock's ingredient list (until USDA/Ciqual import lands).

Run: python -m app.nutrition.seed
"""

import asyncio

from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import SessionLocal
from app.nutrition.models import Ingredient

# name, aliases, kcal, protein, carbs, fat, fiber, sugar — per 100 g (values from index.html)
MOCK_INGREDIENTS: list[tuple[str, list[str], float, float, float, float, float, float]] = [
    ("Chicken breast", ["chicken", "grilled chicken"], 165, 31, 0, 3.6, 0, 0),
    ("Rice (cooked)", ["rice", "cooked rice", "white rice"], 130, 2.7, 28, 0.3, 0.4, 0),
    ("Broccoli", [], 34, 2.8, 7, 0.4, 2.6, 1.7),
    ("Soy sauce", [], 60, 8, 5, 0, 0.8, 0.5),
    ("Olive oil", ["oil", "cooking oil"], 884, 0, 0, 100, 0, 0),
    ("Salmon", ["salmon fillet"], 208, 20, 0, 13, 0, 0),
    ("Potatoes", ["potato", "boiled potatoes"], 77, 2, 17, 0.1, 2.2, 0.8),
    ("Spaghetti", ["pasta", "cooked pasta", "cooked spaghetti"], 158, 5.8, 31, 0.9, 1.8, 1.1),
    ("Tomatoes", ["tomato"], 18, 0.9, 3.9, 0.2, 1.2, 2.6),
    ("Beef mince", ["ground beef", "minced beef"], 250, 26, 0, 15, 0, 0),
    ("Parmesan", ["parmesan cheese"], 350, 25, 1, 28, 0, 0),
    ("Eggs", ["egg", "fried egg", "boiled egg"], 143, 13, 1, 10, 0, 0.4),
    ("Avocado", [], 160, 2, 9, 15, 6.7, 0.7),
    ("Sourdough", ["bread", "sourdough bread"], 265, 9, 49, 3.2, 2.7, 3),
    ("Chickpeas", ["chickpea"], 164, 9, 27, 2.6, 7.6, 3),
    ("Spinach", [], 23, 2.9, 3.6, 0.4, 2.2, 0.4),
    ("Cream", ["cooking cream"], 195, 2, 3, 20, 0, 3),
    ("Lentils", ["lentil", "cooked lentils"], 116, 9, 20, 0.4, 7.9, 1.8),
    ("Onions", ["onion"], 40, 1.1, 9, 0.1, 1.7, 4.2),
    ("Rolled oats", ["oats", "oatmeal"], 389, 17, 66, 7, 10.6, 1),
    ("Milk", [], 42, 3.4, 5, 1, 0, 5),
    ("Canned tomatoes", ["tomato sauce", "chopped tomatoes"], 21, 1.2, 4, 0.1, 1.5, 0),
    ("Banana", [], 89, 1.1, 23, 0.3, 2.6, 12),
]


async def seed_mock(session: AsyncSession) -> None:
    rows = [
        dict(
            name=name,
            aliases=aliases,
            source="mock",
            kcal=k,
            protein=p,
            carbs=c,
            fat=f,
            fiber=fi,
            sugar=s,
        )
        for name, aliases, k, p, c, f, fi, s in MOCK_INGREDIENTS
    ]
    await session.execute(
        insert(Ingredient).values(rows).on_conflict_do_nothing(index_elements=["source", "name"])
    )
    await session.commit()


async def _main() -> None:
    async with SessionLocal() as session:
        await seed_mock(session)


if __name__ == "__main__":
    asyncio.run(_main())
