"""Suggest a logged meal to the rest of the household; accepting logs it for them.

Accepting never touches stock: the meal was cooked once, by whoever logged it first.
"""

from datetime import date

from fastapi import HTTPException, status
from sqlalchemy import exists, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User
from app.auth.service import household_members
from app.logs.models import FoodLog
from app.meals.models import Meal
from app.meals.service import log_entry
from app.suggestions.models import MealSuggestion

SHOWN_DAYS = 2  # today and yesterday: "did you have it too?" stops making sense after that


def already_logged(user_id, meal_id, eaten_on):
    return exists().where(
        FoodLog.user_id == user_id, FoodLog.meal_id == meal_id, FoodLog.eaten_on == eaten_on
    )


async def suggest(
    session: AsyncSession, user: User, meal: Meal, meal_type: str, eaten_on: date
) -> list[int]:
    """One suggestion per other member who hasn't logged this meal that day; returns new ids."""
    ids = []
    for member in await household_members(session, user.household_id):
        if member.id == user.id:
            continue
        if await session.scalar(select(already_logged(member.id, meal.id, eaten_on))):
            continue
        new_id = await session.scalar(
            insert(MealSuggestion)
            .values(
                household_id=user.household_id,
                from_user_id=user.id,
                to_user_id=member.id,
                meal_id=meal.id,
                meal_type=meal_type,
                eaten_on=eaten_on,
            )
            .on_conflict_do_nothing()
            .returning(MealSuggestion.id)
        )
        if new_id is not None:
            ids.append(new_id)
    await session.commit()
    return ids


async def pending_for(session: AsyncSession, user: User, today: date):
    rows = await session.execute(
        select(MealSuggestion, Meal, User)
        .join(Meal, Meal.id == MealSuggestion.meal_id)
        .join(User, User.id == MealSuggestion.from_user_id)
        .where(
            MealSuggestion.to_user_id == user.id,
            MealSuggestion.status == "pending",
            MealSuggestion.eaten_on <= today,
            MealSuggestion.eaten_on > date.fromordinal(today.toordinal() - SHOWN_DAYS),
            ~already_logged(user.id, MealSuggestion.meal_id, MealSuggestion.eaten_on),
        )
        .order_by(MealSuggestion.eaten_on.desc(), MealSuggestion.id.desc())
    )
    return rows.all()


async def lock_pending(session: AsyncSession, user: User, suggestion_id: int) -> MealSuggestion:
    suggestion = await session.scalar(
        select(MealSuggestion).where(MealSuggestion.id == suggestion_id).with_for_update()
    )
    if suggestion is None or suggestion.to_user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Suggestion not found")
    if suggestion.status != "pending":
        raise HTTPException(status.HTTP_409_CONFLICT, f"Already {suggestion.status}")
    return suggestion


async def accept(session: AsyncSession, user: User, suggestion: MealSuggestion, servings: float):
    meal = await session.get(Meal, suggestion.meal_id)
    entry = log_entry(
        user,
        meal,
        meal_type=suggestion.meal_type,
        eaten_on=suggestion.eaten_on,
        source="shared",
        portions=servings,  # a snack: that many portions in its unit
    )
    session.add(entry)
    suggestion.status = "accepted"
    await session.commit()
    return entry
