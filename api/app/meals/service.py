from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.analysis.models import AnalysisJob
from app.auth.models import User
from app.inventory.service import deduct, mark_used_up
from app.logs.models import FoodLog
from app.meals.models import CookLog, Meal, MealIngredient
from app.meals.recipes import template_steps
from app.meals.schemas import MealCreate, MealIngredientOut, MealOut
from app.nutrition.macros import Nutrients, total
from app.nutrition.models import Ingredient
from app.nutrition.schemas import IngredientOut, NutrientsOut


def recipe_nutrients(meal: Meal) -> Nutrients:
    return total(mi.ingredient.per100.scaled(mi.grams) for mi in meal.ingredients)


def estimated_cost(meal: Meal) -> float:
    return sum(mi.ingredient.price_per_100g * mi.grams / 100 for mi in meal.ingredients)


def meal_out(meal: Meal) -> MealOut:
    per_portion = recipe_nutrients(meal).scaled(100 / meal.portions)
    ordered = sorted(meal.ingredients, key=lambda mi: -mi.grams)
    return MealOut(
        id=meal.id,
        name=meal.name,
        emoji=meal.emoji,
        photo_url=f"/api/meals/{meal.id}/photo" if meal.photo_path else None,
        types=meal.types,
        tags=meal.tags,
        prep_minutes=meal.prep_minutes,
        portions=meal.portions,
        cost=round(meal.cost if meal.cost is not None else estimated_cost(meal), 2),
        cost_estimated=meal.cost is None,
        steps=meal.steps,
        steps_source=meal.steps_source,
        ingredients=[
            MealIngredientOut(ingredient=IngredientOut.of(mi.ingredient), grams=round(mi.grams, 1))
            for mi in ordered
        ],
        per_portion=NutrientsOut(**per_portion.rounded()),
        created_at=meal.created_at,
    )


async def post_meal(session: AsyncSession, user: User, body: MealCreate) -> Meal:
    ids = [i.ingredient_id for i in body.items]
    found = {
        i.id: i for i in await session.scalars(select(Ingredient).where(Ingredient.id.in_(ids)))
    }
    if missing := set(ids) - set(found):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"Unknown ingredients {missing}")

    analysis = None
    if body.analysis_id is not None:
        analysis = await session.get(AnalysisJob, body.analysis_id)
        if analysis is None or analysis.household_id != user.household_id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Analysis not found")
        if analysis.meal_id is not None:
            raise HTTPException(status.HTTP_409_CONFLICT, "This photo was already posted")

    plate = {i.ingredient_id: i.grams for i in body.items}
    recipe = {k: g * body.portions for k, g in plate.items()}
    by_weight = sorted(ids, key=lambda k: -plate[k])

    meal = Meal(
        household_id=user.household_id,
        created_by=user.id,
        name=body.name.strip(),
        emoji=found[by_weight[0]].emoji or "🍽️",
        photo_path=analysis.photo_path if analysis else None,
        types=[body.meal_type],
        tags=[],
        prep_minutes=body.prep_minutes,
        portions=body.portions,
        cost=body.cost,
        steps=template_steps([found[k].name for k in by_weight], body.prep_minutes, body.portions),
        ingredients=[
            MealIngredient(ingredient_id=k, grams=recipe[k], ingredient=found[k]) for k in ids
        ],
    )
    session.add(meal)
    await session.flush()

    session.add(CookLog(meal_id=meal.id, user_id=user.id, cooked_on=body.eaten_on))
    eaten = total(found[k].per100.scaled(g) for k, g in plate.items()).scaled(
        body.servings_eaten * 100
    )
    log = FoodLog(
        household_id=user.household_id,
        user_id=user.id,
        eaten_on=body.eaten_on,
        meal_type=body.meal_type,
        name=meal.name,
        emoji=meal.emoji,
        meal_id=meal.id,
        kind="meal",
        source="snap",
    )
    log.set_nutrients(eaten)
    session.add(log)

    await deduct(session, user.household_id, recipe)
    await mark_used_up(session, user.household_id, body.used_up)
    if analysis:
        analysis.meal_id = meal.id
    await session.commit()
    return meal


async def get_own_meal(session: AsyncSession, user: User, meal_id: int) -> Meal:
    meal = await session.get(Meal, meal_id)
    if meal is None or meal.household_id != user.household_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Meal not found")
    return meal
