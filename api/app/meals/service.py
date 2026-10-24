from collections import defaultdict
from dataclasses import asdict
from datetime import UTC, date, datetime

from fastapi import HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.analysis.queue import close, lock_open_job, move_early_ratings
from app.auth.models import User
from app.auth.service import household_members
from app.inventory.service import deduct, mark_used_up
from app.logs.models import FoodLog
from app.logs.service import snack_nutrients
from app.meals.families import family_of
from app.meals.models import TYPES, CookLog, Meal, MealIngredient
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
    SnackInfo,
)
from app.meals.undo import ran_out_of, stock_of, undo_record, undo_until
from app.nutrition.macros import Nutrients, total
from app.nutrition.models import Ingredient
from app.nutrition.schemas import IngredientOut, NutrientsOut
from app.ratings.models import Rating, is_snack_only, meal_score, meal_taste


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


def portion_grams(meal: Meal) -> float:
    return sum(mi.grams for mi in meal.ingredients) / meal.portions


def grams_per_amount(meal: Meal) -> float:
    """Grams in an amount of 1 as the meal is logged: a portion, a piece, or 1 g / ml."""
    if meal.per == "piece" and meal.piece_g:
        return meal.piece_g
    return 1.0 if meal.per in ("100g", "100ml") else portion_grams(meal)


def per_unit(meal: Meal) -> Nutrients:
    """Values for one portion/piece or per 100 g / ml (`meal.per`), from the values per portion."""
    grams = portion_grams(meal)
    if meal.per == "portion" or grams <= 0:
        return per_portion(meal)
    unit = 100 if meal.per in ("100g", "100ml") else grams_per_amount(meal)
    return per_portion(meal).scaled(100 * unit / grams)


def amount_of(meal: Meal, portions: float) -> float:
    """Portions → the amount in the meal's unit (2 portions of 150 g = 300 g, or 3 pieces)."""
    one = grams_per_amount(meal)
    if meal.per == "portion" or one <= 0:
        return portions
    return round(portions * portion_grams(meal) / one, 1)


def snack_info(meal: Meal) -> dict:
    return SnackInfo(
        snack_kind=meal.snack_kind,
        per=meal.per,
        piece_g=meal.piece_g,
        is_product=meal.is_product,
        per_unit=NutrientsOut(**{k: round(v, 2) for k, v in asdict(per_unit(meal)).items()}),
        portion_g=round(portion_grams(meal), 1),
    ).model_dump() | {
        "origin": meal.origin,
        "listed": meal.listed,
        "place": meal.place,
        "family": family_of(meal),
        "family_picked": meal.family is not None,
    }


def log_entry(
    user: User,
    meal: Meal,
    *,
    meal_type: str,
    eaten_on: date,
    source: str,
    portions: float = 1,
    amount: float | None = None,
) -> FoodLog:
    """A food-log entry for eating this meal: portions, or a snack's amount in its unit (0025)."""
    entry = FoodLog(
        household_id=user.household_id,
        user_id=user.id,
        eaten_on=eaten_on,
        meal_type=meal_type,
        name=meal.name,
        emoji=meal.emoji,
        meal_id=meal.id,
        source=source,
    )
    if meal_type == "snack":
        entry.kind, entry.snack_kind, entry.per = "snack", meal.snack_kind or "savory", meal.per
        entry.servings = amount if amount is not None else amount_of(meal, portions)
        entry.per_unit = {k: round(v, 3) for k, v in asdict(per_unit(meal)).items()}
        entry.set_nutrients(snack_nutrients(entry))
    else:
        entry.kind, entry.servings = "meal", portions
        entry.set_nutrients(per_portion(meal).scaled(portions * 100))
    return entry


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
        taste=meal_taste(ratings),
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
        **snack_info(meal),
    )


def _undo_until_for(meal: Meal, user: User) -> datetime | None:
    until = undo_until(meal)
    if until is None or meal.created_by != user.id or datetime.now(UTC) > until:
        return None
    return until


async def meal_cards(session: AsyncSession, user: User) -> list[MealCard]:
    meals = list(
        await session.scalars(
            select(Meal)
            .where(Meal.household_id == user.household_id, Meal.listed.is_(True))
            .order_by(Meal.id.desc())
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
                taste=meal_taste(rs),
                cooked_count=count,
                last_cooked=last,
                rated_by_me=any(r.user_id == user.id for r in rs),
                kcal_per_portion=round(portion.kcal, 1),
                created_at=m.created_at,
                **snack_info(m),
            )
        )
    return cards


def apply_rating(rating, body: RatingIn, *, snack: bool) -> None:
    """Meals default the sliders to the middle; snacks aren't cooked, so they have none."""
    rating.taste, rating.again, rating.note = body.taste, body.again, body.note
    if snack:
        rating.effort = rating.fill = None
    else:
        rating.effort = 0 if body.effort is None else body.effort
        rating.fill = 0 if body.fill is None else body.fill


async def save_rating(session: AsyncSession, user: User, meal: Meal, body: RatingIn) -> None:
    rating = await session.scalar(
        select(Rating).where(Rating.meal_id == meal.id, Rating.user_id == user.id)
    )
    if rating is None:
        rating = Rating(meal_id=meal.id, user_id=user.id)
        session.add(rating)
    apply_rating(rating, body, snack=is_snack_only(meal.types))
    await session.commit()


async def cook_again(session: AsyncSession, user: User, meal: Meal, body: CookIn) -> None:
    """Logs the portions eaten; cooking now also takes the whole recipe out of stock.

    Snacks: the amount in the meal's unit; every one counts as eaten. A product takes what was
    eaten out of stock (if it's there); a home-made snack made now, the whole recipe."""
    recipe = {mi.ingredient_id: mi.grams for mi in meal.ingredients}
    if not set(body.used_up) <= set(recipe):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "used_up must only contain this meal's ingredients",
        )
    snack = body.meal_type == "snack"
    if snack and "snack" not in meal.types:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, "Not a snack: add Snack to it in Edit meal"
        )
    if body.cooked or snack:
        session.add(CookLog(meal_id=meal.id, user_id=user.id, cooked_on=body.eaten_on))
    log = log_entry(
        user,
        meal,
        meal_type=body.meal_type,
        eaten_on=body.eaten_on,
        source="cook" if body.cooked else "leftover",
        portions=body.servings_eaten,
        amount=body.amount,
    )
    session.add(log)
    if body.cooked and meal.origin == "home":  # bought / eaten out never leaves our stock
        if snack and meal.is_product:
            eaten = log.servings * grams_per_amount(meal)
            await deduct(session, user.household_id, {k: eaten for k in recipe})
        else:
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

    cooked = body.origin == "home"
    portions = body.portions if cooked else 1  # bought / out: the plate we had
    plate = {i.ingredient_id: i.grams for i in body.items}
    recipe = {k: g * portions for k, g in plate.items()}
    by_weight = sorted(ids, key=lambda k: -plate[k])

    meal = Meal(
        household_id=user.household_id,
        created_by=user.id,
        name=body.name.strip(),
        emoji=found[by_weight[0]].emoji or "🍽️",
        photo_path=analysis.photo_path if analysis else None,
        types=[body.meal_type],
        snack_kind=body.snack_kind if body.meal_type == "snack" else None,
        per=body.per,
        piece_g=body.piece_g,
        tags=[],
        prep_minutes=body.prep_minutes if cooked else 0,
        portions=portions,
        cost=body.cost,
        steps=template_steps([found[k].name for k in by_weight], body.prep_minutes, portions)
        if cooked
        else [],
        origin=body.origin,
        listed=cooked,
        place=(body.place or "").strip() or None,
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
        session.add(
            log_entry(
                user,
                meal,
                meal_type=body.meal_type,
                eaten_on=body.eaten_on,
                source="snap",
                portions=body.servings_eaten,
            )
        )

        if cooked:
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
        await move_early_ratings(session, analysis, meal.id, snack=is_snack_only(meal.types))
    await session.commit()
    return meal


async def update_meal(session: AsyncSession, meal: Meal, body: MealPatch) -> None:
    sent = body.model_fields_set
    if body.items is not None:
        own = [mi.ingredient_id for mi in meal.ingredients]
        await _replace_ingredients(session, meal, body.items)
        if [i.ingredient_id for i in body.items] != own:
            meal.is_product = False  # ingredients added: a recipe of its own now
    if "cost" in sent:
        meal.cost = body.cost
    if "per_portion" in sent:
        meal.nutrients_override = body.per_portion.model_dump() if body.per_portion else None
    if body.name is not None:
        meal.name = body.name.strip()
    if body.emoji is not None:
        meal.emoji = body.emoji
    if body.types is not None:
        meal.types = [t for t in TYPES if t in body.types]
    _update_snack(meal, body)
    if body.product_per100 is not None:
        if not meal.is_product:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT, "Only a product has pack values"
            )
        product = meal.ingredients[0].ingredient
        for key, value in body.product_per100.model_dump().items():
            setattr(product, key, value)
    if body.prep_friendly is not None:
        tags = [t for t in meal.tags if t != "prep-friendly"]
        meal.tags = tags + ["prep-friendly"] if body.prep_friendly else tags
    if body.prep_minutes is not None:
        meal.prep_minutes = body.prep_minutes
    if body.portions is not None:
        meal.portions = body.portions
    if body.steps is not None:
        meal.steps, meal.steps_source = body.steps, "ours"  # the model won't overwrite them
    if body.listed is not None:
        meal.listed = body.listed
    if body.family is not None:
        meal.family = body.family.strip() or None
    await session.flush()
    await _refresh_logs(session, meal)
    await session.commit()


def _update_snack(meal: Meal, body: MealPatch) -> None:
    snack = "snack" in meal.types
    if body.snack_kind is not None:
        meal.snack_kind = body.snack_kind
    if body.per is not None:
        meal.per = body.per
        meal.piece_g = body.piece_g if body.per == "piece" else None
    elif body.piece_g is not None:
        meal.piece_g = body.piece_g
    if not snack:  # no longer a snack: logged in portions like any meal
        meal.snack_kind, meal.per, meal.piece_g = None, "portion", None
    elif meal.snack_kind is None:
        meal.snack_kind = "savory"
    if meal.per == "piece" and not meal.piece_g:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, "Pieces come with the weight of one piece"
        )
    if body.per is not None and body.per != "portion" and not snack:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, "Only snacks are counted in pieces, g or ml"
        )
    if meal.is_product:  # the fridge counts the product the same way
        product = meal.ingredients[0].ingredient
        product.unit, product.unit_grams = {
            "piece": ("pc", meal.piece_g),
            "100ml": ("ml", 1.0),
        }.get(meal.per, (None, None))


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
    one = {k: round(v, 3) for k, v in asdict(per_unit(meal)).items()}
    for log in await session.scalars(select(FoodLog).where(FoodLog.meal_id == meal.id)):
        log.name, log.emoji = meal.name, meal.emoji
        if log.kind == "snack":
            if log.per == meal.per:  # counted another way back then: stays as logged
                log.per_unit, log.snack_kind = one, meal.snack_kind or log.snack_kind
                log.set_nutrients(snack_nutrients(log))
        else:
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
