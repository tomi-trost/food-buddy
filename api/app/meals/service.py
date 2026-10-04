from collections import defaultdict
from datetime import date

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.analysis.models import AnalysisJob
from app.auth.models import User
from app.auth.service import household_members
from app.inventory.service import deduct, mark_used_up
from app.logs.models import FoodLog
from app.meals.models import CookLog, Meal, MealIngredient
from app.meals.recipes import template_steps
from app.meals.schemas import (
    CookIn,
    MealCard,
    MealCreate,
    MealIngredientOut,
    MealOut,
    MealPatch,
    RatingIn,
    RatingOut,
)
from app.nutrition.macros import Nutrients, total
from app.nutrition.models import Ingredient
from app.nutrition.schemas import IngredientOut, NutrientsOut
from app.ratings.models import Rating, meal_score


def recipe_nutrients(meal: Meal) -> Nutrients:
    return total(mi.ingredient.per100.scaled(mi.grams) for mi in meal.ingredients)


def estimated_cost(meal: Meal) -> float:
    return sum(mi.ingredient.price_per_100g * mi.grams / 100 for mi in meal.ingredients)


def per_portion(meal: Meal) -> Nutrients:
    return recipe_nutrients(meal).scaled(100 / meal.portions)


def effective_cost(meal: Meal) -> float:
    return round(meal.cost if meal.cost is not None else estimated_cost(meal), 2)


def display_tags(meal: Meal, portion: Nutrients) -> list[str]:
    """Stored tags (e.g. prep-friendly) plus ones derived from the numbers."""
    tags = list(meal.tags)
    derived = {
        "quick": meal.prep_minutes <= 20,
        "high-protein": portion.protein >= 30,
        "high-fiber": portion.fiber >= 8,
    }
    tags += [t for t, ok in derived.items() if ok and t not in tags]
    return tags


async def cook_stats(session: AsyncSession, meal_ids: list[int]) -> dict[int, tuple[int, date]]:
    rows = await session.execute(
        select(CookLog.meal_id, func.count(), func.max(CookLog.cooked_on))
        .where(CookLog.meal_id.in_(meal_ids))
        .group_by(CookLog.meal_id)
    )
    return {meal_id: (count, last) for meal_id, count, last in rows}


async def ratings_by_meal(session: AsyncSession, meal_ids: list[int]) -> dict[int, list[Rating]]:
    out: dict[int, list[Rating]] = defaultdict(list)
    for r in await session.scalars(select(Rating).where(Rating.meal_id.in_(meal_ids))):
        out[r.meal_id].append(r)
    return out


def rating_in(r: Rating) -> RatingIn:
    return RatingIn(taste=float(r.taste), again=r.again, effort=r.effort, fill=r.fill, note=r.note)


async def meal_out(session: AsyncSession, user: User, meal: Meal) -> MealOut:
    portion = per_portion(meal)
    stats = (await cook_stats(session, [meal.id])).get(meal.id, (0, None))
    ratings = (await ratings_by_meal(session, [meal.id])).get(meal.id, [])
    mine = {r.user_id: r for r in ratings}
    members = await household_members(session, user.household_id)
    ordered = sorted(meal.ingredients, key=lambda mi: -mi.grams)
    return MealOut(
        id=meal.id,
        name=meal.name,
        emoji=meal.emoji,
        photo_url=f"/api/meals/{meal.id}/photo" if meal.photo_path else None,
        types=meal.types,
        tags=display_tags(meal, portion),
        prep_minutes=meal.prep_minutes,
        portions=meal.portions,
        cost=effective_cost(meal),
        cost_estimated=meal.cost is None,
        steps=meal.steps,
        steps_source=meal.steps_source,
        ingredients=[
            MealIngredientOut(ingredient=IngredientOut.of(mi.ingredient), grams=round(mi.grams, 1))
            for mi in ordered
        ],
        per_portion=NutrientsOut(**portion.rounded()),
        score=meal_score(ratings),
        cooked_count=stats[0],
        last_cooked=stats[1],
        ratings=[
            RatingOut(
                user_id=m.id,
                name=m.name,
                color=m.color,
                rating=rating_in(mine[m.id]) if m.id in mine else None,
            )
            for m in members
        ],
        created_at=meal.created_at,
    )


async def meal_cards(session: AsyncSession, user: User) -> list[MealCard]:
    meals = list(
        await session.scalars(
            select(Meal).where(Meal.household_id == user.household_id).order_by(Meal.id.desc())
        )
    )
    ids = [m.id for m in meals]
    stats = await cook_stats(session, ids)
    ratings = await ratings_by_meal(session, ids)
    cards = []
    for m in meals:
        portion = per_portion(m)
        count, last = stats.get(m.id, (0, None))
        rs = ratings.get(m.id, [])
        cards.append(
            MealCard(
                id=m.id,
                name=m.name,
                emoji=m.emoji,
                photo_url=f"/api/meals/{m.id}/photo" if m.photo_path else None,
                types=m.types,
                tags=display_tags(m, portion),
                prep_minutes=m.prep_minutes,
                portions=m.portions,
                cost=effective_cost(m),
                score=meal_score(rs),
                cooked_count=count,
                last_cooked=last,
                rated_by_me=any(r.user_id == user.id for r in rs),
                kcal_per_portion=round(portion.kcal, 1),
                created_at=m.created_at,
            )
        )
    return cards


async def save_rating(session: AsyncSession, user: User, meal: Meal, body: RatingIn) -> None:
    rating = await session.scalar(
        select(Rating).where(Rating.meal_id == meal.id, Rating.user_id == user.id)
    )
    if rating is None:
        rating = Rating(meal_id=meal.id, user_id=user.id)
        session.add(rating)
    rating.taste, rating.again, rating.effort = body.taste, body.again, body.effort
    rating.fill, rating.note = body.fill, body.note
    await session.commit()


async def cook_again(session: AsyncSession, user: User, meal: Meal, body: CookIn) -> None:
    """Logs one portion as eaten and takes the whole recipe out of stock (like the mock)."""
    recipe = {mi.ingredient_id: mi.grams for mi in meal.ingredients}
    if not set(body.used_up) <= set(recipe):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "used_up must only contain this meal's ingredients",
        )
    session.add(CookLog(meal_id=meal.id, user_id=user.id, cooked_on=body.eaten_on))
    log = FoodLog(
        household_id=user.household_id,
        user_id=user.id,
        eaten_on=body.eaten_on,
        meal_type=body.meal_type,
        name=meal.name,
        emoji=meal.emoji,
        meal_id=meal.id,
        kind="meal",
        source="cook",
    )
    log.set_nutrients(per_portion(meal))
    session.add(log)
    await deduct(session, user.household_id, recipe)
    await mark_used_up(session, user.household_id, body.used_up)
    await session.commit()


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


async def update_meal(session: AsyncSession, meal: Meal, body: MealPatch) -> None:
    if body.name is not None:
        meal.name = body.name.strip()
    if body.types is not None:
        meal.types = [t for t in ("breakfast", "lunch", "dinner") if t in body.types]
    if body.prep_friendly is not None:
        tags = [t for t in meal.tags if t != "prep-friendly"]
        meal.tags = tags + ["prep-friendly"] if body.prep_friendly else tags
    if body.prep_minutes is not None:
        meal.prep_minutes = body.prep_minutes
    if body.portions is not None:
        meal.portions = body.portions
    await session.commit()


async def get_own_meal(session: AsyncSession, user: User, meal_id: int) -> Meal:
    meal = await session.get(Meal, meal_id)
    if meal is None or meal.household_id != user.household_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Meal not found")
    return meal
