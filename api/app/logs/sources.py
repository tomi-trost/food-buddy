"""Where each nutrient comes from: the ingredients a person ate most often over a range.

Each ingredient sits under the macro that gives most of its energy (protein, carbs or fat);
carbs that are mostly sugar go under sugar instead. Fiber-rich ingredients (≥ 5 g / 100 g) are
also listed under fiber. Ordered by how many eaten entries had them, then by grams eaten."""

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.logs.models import FoodLog
from app.meals.models import Meal
from app.meals.service import grams_per_amount
from app.nutrition.models import Ingredient

GROUPS = ("protein", "carbs", "fat", "fiber", "sugar")
FIBER_RICH_G = 5  # per 100 g
TOP = 8


def groups_of(i: Ingredient) -> list[str]:
    energy = {"protein": i.protein * 4, "carbs": i.carbs * 4, "fat": i.fat * 9}
    out = []
    if any(energy.values()):
        main = max(energy, key=energy.__getitem__)
        if main == "carbs" and (i.sugar or 0) * 2 >= i.carbs:
            main = "sugar"
        out.append(main)
    if (i.fiber or 0) >= FIBER_RICH_G:
        out.append("fiber")
    return out


def share_eaten(entry: FoodLog, meal: Meal) -> float:
    """The part of the whole recipe this entry ate."""
    total = sum(mi.grams for mi in meal.ingredients)
    if total <= 0:
        return 0
    if entry.kind == "snack":
        return entry.servings * grams_per_amount(meal) / total
    return entry.servings / meal.portions


@dataclass
class Tally:
    ingredient: Ingredient
    times: int = 0
    grams: float = 0
    entries: set[int] = field(default_factory=set)


async def sources(
    session: AsyncSession, household_id: int, user_id: int, start: date, end: date
) -> dict[str, list[Tally]]:
    entries = list(
        await session.scalars(
            select(FoodLog).where(
                FoodLog.household_id == household_id,
                FoodLog.user_id == user_id,
                FoodLog.eaten_on >= start,
                FoodLog.eaten_on <= end,
                FoodLog.meal_id.is_not(None),
            )
        )
    )
    meals = {
        m.id: m
        for m in await session.scalars(
            select(Meal).where(Meal.id.in_({e.meal_id for e in entries}))
        )
    }
    tally: dict[int, Tally] = {}
    for e in entries:
        meal = meals.get(e.meal_id)
        if meal is None:
            continue
        share = share_eaten(e, meal)
        for mi in meal.ingredients:
            t = tally.setdefault(mi.ingredient_id, Tally(mi.ingredient))
            if e.id not in t.entries:
                t.entries.add(e.id)
                t.times += 1
            t.grams += mi.grams * share
    grouped: dict[str, list[Tally]] = defaultdict(list)
    for t in tally.values():
        for g in groups_of(t.ingredient):
            grouped[g].append(t)
    return {
        g: sorted(grouped[g], key=lambda t: (-t.times, -t.grams, t.ingredient.name))[:TOP]
        for g in GROUPS
    }
