import logging

import httpx
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.config import get_settings
from app.db import SessionLocal
from app.jobs import jobs_app
from app.meals.models import Meal, MealIngredient
from app.meals.recipes import RecipeAnswer, recipe_messages
from app.vision.providers import AllProvidersFailed, VisionChain, chain_from_settings

log = logging.getLogger(__name__)


async def improve_recipe(session, meal_id: int, chain: VisionChain) -> bool:
    """Replace the template steps with model-written ones. Keeps the template on failure."""
    meal = await session.scalar(
        select(Meal)
        .where(Meal.id == meal_id)
        .options(selectinload(Meal.ingredients).joinedload(MealIngredient.ingredient))
        .execution_options(populate_existing=True)
    )
    if meal is None or meal.steps_source != "template":
        return False
    items = [
        (mi.ingredient.name, mi.grams) for mi in sorted(meal.ingredients, key=lambda m: -m.grams)
    ]
    try:
        _, answer = await chain.chat_json(
            recipe_messages(meal.name, items, meal.prep_minutes, meal.portions), RecipeAnswer
        )
    except AllProvidersFailed as exc:
        log.warning("recipe for meal %s stays a template: %s", meal_id, exc)
        return False
    meal.steps = [s.strip() for s in answer.steps if s.strip()]
    meal.steps_source = "model"
    await session.commit()
    return True


@jobs_app.task(name="generate_recipe", queue="vision")
async def generate_recipe(meal_id: int) -> None:
    async with httpx.AsyncClient() as client, SessionLocal() as session:
        await improve_recipe(session, meal_id, chain_from_settings(get_settings(), client))
