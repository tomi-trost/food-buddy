"""Print our posted meals with a photo as JSON lines (photo base64-encoded).

Imports only `app`, so benchmark.household can pipe this file into the api container on the VM
(`python -` there) without the benchmark being part of the image.
"""

import asyncio
import base64
import json

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.config import get_settings
from app.db import SessionLocal
from app.meals.models import Meal
from app.meals.service import per_portion

TOTAL_KEYS = ("kcal", "protein", "carbs", "fat")


def meal_sample(meal: Meal) -> dict:
    """Truth for one plate: the saved recipe divided by portions made."""
    nutrients = per_portion(meal)
    return {
        "id": f"meal-{meal.id}",
        "image": f"meal-{meal.id}.jpg",
        "source": "household",
        "dish": meal.name,
        "items": [
            {"name": mi.ingredient.name, "grams": round(mi.grams / meal.portions, 1)}
            for mi in meal.ingredients
        ],
        "totals": {k: round(getattr(nutrients, k), 1) for k in TOTAL_KEYS},
        "notes": {"overridden": meal.nutrients_override is not None},
    }


async def dump() -> None:
    photo_dir = get_settings().photo_dir
    async with SessionLocal() as session:
        meals = await session.scalars(
            select(Meal)
            .where(Meal.photo_path.is_not(None))
            .options(selectinload(Meal.ingredients))
            .order_by(Meal.id)
        )
        for meal in meals:
            photo = photo_dir / meal.photo_path
            if not photo.exists():
                continue
            line = meal_sample(meal) | {"jpeg": base64.b64encode(photo.read_bytes()).decode()}
            print(json.dumps(line, ensure_ascii=False))


if __name__ == "__main__":
    asyncio.run(dump())
