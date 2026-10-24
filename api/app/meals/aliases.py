"""Aliases (#18): what a photo called something we swapped for one of our dishes ("pancakes" →
our Healthy banana pancakes). They come from the swaps (meals.bundles.add_aliases) and are
matched in code after the model, not in its prompt. The check screen asks before swapping; after
MAX_DECLINED "No"s in a row an alias isn't offered anymore (until we swap it by hand again)."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.meals.models import Meal, MealAlias
from app.meals.schemas import DishOption, DishSuggestion
from app.meals.service import effective_cost, per_portion, portion_grams
from app.nutrition.matching import normalize
from app.nutrition.schemas import NutrientsOut

MAX_DECLINED = 3


async def household_aliases(session: AsyncSession, household_id: int) -> dict[str, Meal]:
    """Alias → the dish it stands for; with two dishes for one name, the one we said No to least."""
    rows = await session.execute(
        select(MealAlias.name, Meal)
        .join(Meal, Meal.id == MealAlias.meal_id)
        .where(Meal.household_id == household_id, MealAlias.declined < MAX_DECLINED)
        .order_by(MealAlias.declined.desc(), Meal.id)
    )
    return {name: meal for name, meal in rows}  # later rows (fewer No's, newer) win


def dish_option(meal: Meal) -> DishOption:
    return DishOption(
        id=meal.id,
        name=meal.name,
        emoji=meal.emoji,
        portions=meal.portions,
        portion_g=round(portion_grams(meal), 1),
        cost=round(effective_cost(meal), 2),
        per_portion=NutrientsOut(**per_portion(meal).rounded()),
    )


def suggestions(result: dict | None, aliases: dict[str, Meal]) -> list[DishSuggestion]:
    out = []
    for n, item in enumerate((result or {}).get("items", [])):
        dish = aliases.get(normalize(item["name"]))
        if dish is not None:
            out.append(DishSuggestion(item=n, name=item["name"], dish=dish_option(dish)))
    return out


async def decline(session: AsyncSession, dish: Meal, name: str) -> None:
    """ "No, that's not our dish": counted per alias; a swap (or Edit meal) starts it again."""
    alias = next((a for a in dish.aliases if a.name == normalize(name)), None)
    if alias is not None:
        alias.declined += 1
        await session.commit()
