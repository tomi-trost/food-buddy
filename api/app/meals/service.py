from collections import defaultdict
from datetime import UTC, date, datetime

from fastapi import HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.analysis.queue import close, lock_open_job, move_early_ratings
from app.auth.models import User
from app.auth.service import household_members
from app.inventory.service import deduct, mark_used_up
from app.logs.models import FoodLog
from app.meals.models import CookLog, Meal, MealIngredient
from app.meals.recipes import template_steps
from app.meals.schemas import (
    CookIn,
    ItemIn,
    MealCard,
    MealCreate,
    MealIngredientOut,
    MealOut,
    MealPatch,
    RatingIn,
    RatingOut,
)
from app.meals.undo import ran_out_of, stock_of, undo_record, undo_until
from app.nutrition.macros import Nutrients, total
from app.nutrition.models import Ingredient
from app.nutrition.schemas import IngredientOut, NutrientsOut
from app.ratings.models import Rating, meal_score


def recipe_nutrients(meal: Meal) -> Nutrients:
    return total(mi.ingredient.per100.scaled(mi.grams) for mi in meal.ingredients)


def estimated_cost(meal: Meal) -> float:
    return sum(mi.ingredient.price_per_100g * mi.grams / 100 for mi in meal.ingredients)


def calculated_per_portion(meal: Meal) -> Nutrients:
    return recipe_nutrients(meal).scaled(100 / meal.portions)


def per_portion(meal: Meal) -> Nutrients:
    """Typed-in values win over the ones calculated from the ingredients."""
    if meal.nutrients_override is not None:
        return Nutrients(**meal.nutrients_override)
    return calculated_per_portion(meal)


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
    logged = await session.scalar(select(func.count()).where(FoodLog.meal_id == meal.id))
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
        per_portion_calculated=NutrientsOut(**calculated_per_portion(meal).rounded()),
        nutrients_overridden=meal.nutrients_override is not None,
        logged_count=logged or 0,
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
        undo_until=_undo_until_for(meal, user),
    )


def _undo_until_for(meal: Meal, user: User) -> datetime | None:
    until = undo_until(meal)
    if until is None or meal.created_by != user.id or datetime.now(UTC) > until:
        return None
    return until


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
    """Logs the portions eaten; cooking now also takes the whole recipe out of stock."""
    recipe = {mi.ingredient_id: mi.grams for mi in meal.ingredients}
    if not set(body.used_up) <= set(recipe):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "used_up must only contain this meal's ingredients",
        )
    if body.cooked:
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
        source="cook" if body.cooked else "leftover",
        servings=body.servings_eaten,
    )
    log.set_nutrients(per_portion(meal).scaled(body.servings_eaten * 100))
    session.add(log)
    if body.cooked:
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
        # Locked: if both of us confirm the same photo, the second one gets 409
        analysis = await lock_open_job(session, user, body.analysis_id)

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
        nutrients_override=body.per_portion.model_dump() if body.per_portion else None,
        ingredients=[
            MealIngredient(ingredient_id=k, grams=recipe[k], ingredient=found[k]) for k in ids
        ],
    )
    session.add(meal)
    await session.flush()

    touched = set(recipe) | set(body.used_up)
    stock_before = await stock_of(session, user.household_id, touched)
    ran_before = await ran_out_of(session, user.household_id)
    if body.eaten:  # saved for later: only the recipe goes into the library
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
            source="snap",
            servings=body.servings_eaten,
        )
        log.set_nutrients(per_portion(meal).scaled(body.servings_eaten * 100))
        session.add(log)

        await deduct(session, user.household_id, recipe)
        await mark_used_up(session, user.household_id, body.used_up)
        await session.flush()
    meal.undo = undo_record(
        analysis.id if analysis else None,
        stock_before,
        await stock_of(session, user.household_id, touched),
        ran_before,
        await ran_out_of(session, user.household_id),
    )
    if analysis:
        close(analysis, meal_id=meal.id)
        await move_early_ratings(session, analysis, meal.id)
    await session.commit()
    return meal


async def update_meal(session: AsyncSession, meal: Meal, body: MealPatch) -> None:
    sent = body.model_fields_set
    if body.items is not None:
        await _replace_ingredients(session, meal, body.items)
    if "cost" in sent:
        meal.cost = body.cost
    if "per_portion" in sent:
        meal.nutrients_override = body.per_portion.model_dump() if body.per_portion else None
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
    if body.steps is not None:
        meal.steps, meal.steps_source = body.steps, "ours"  # the model won't overwrite them
    await session.flush()
    await _refresh_logs(session, meal)
    await session.commit()


async def _replace_ingredients(session: AsyncSession, meal: Meal, items: list[ItemIn]) -> None:
    ids = [i.ingredient_id for i in items]
    found = {
        i.id: i for i in await session.scalars(select(Ingredient).where(Ingredient.id.in_(ids)))
    }
    if missing := set(ids) - set(found):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"Unknown ingredients {missing}")
    # In place: the unit of work inserts before it deletes, so replacing the list would
    # briefly hold the same ingredient twice (unique per meal)
    grams = {i.ingredient_id: i.grams for i in items}
    for mi in list(meal.ingredients):
        if mi.ingredient_id in grams:
            mi.grams = grams.pop(mi.ingredient_id)
        else:
            meal.ingredients.remove(mi)
    await session.flush()
    for k, g in grams.items():
        meal.ingredients.append(MealIngredient(ingredient_id=k, grams=g, ingredient=found[k]))
    meal.emoji = found[max(items, key=lambda i: i.grams).ingredient_id].emoji or meal.emoji


async def _refresh_logs(session: AsyncSession, meal: Meal) -> None:
    """Days this meal was eaten follow the edit: name and nutrition (portions eaten × per portion).

    Stock taken out when it was cooked stays as it was.
    """
    portion = per_portion(meal)
    for log in await session.scalars(select(FoodLog).where(FoodLog.meal_id == meal.id)):
        log.name, log.emoji = meal.name, meal.emoji
        log.set_nutrients(portion.scaled(log.servings * 100))


async def delete_meal(session: AsyncSession, meal: Meal, *, keep_log: bool) -> None:
    """Ratings, ingredients and cook counts go with it; plan slots become empty.

    With `keep_log` the food-log entries stay (unlinked) so past days keep their totals.
    """
    if not keep_log:
        await session.execute(delete(FoodLog).where(FoodLog.meal_id == meal.id))
    await session.delete(meal)
    await session.commit()


async def delete_rating(session: AsyncSession, user: User, meal: Meal) -> None:
    await session.execute(
        delete(Rating).where(Rating.meal_id == meal.id, Rating.user_id == user.id)
    )
    await session.commit()


async def get_own_meal(session: AsyncSession, user: User, meal_id: int) -> Meal:
    meal = await session.get(Meal, meal_id)
    if meal is None or meal.household_id != user.household_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Meal not found")
    return meal
