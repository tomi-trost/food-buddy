"""Undo a post right after it: the meal goes, stock and the shopping list are as before, and the
photo is back in the "to check" banner (with any ratings) to post again."""

from datetime import UTC, date, datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.analysis.models import AnalysisJob, AnalysisRating
from app.auth.models import User
from app.inventory.models import InventoryItem, RanOut
from app.logs.models import FoodLog
from app.meals.models import CookLog, Meal, MealComponent
from app.ratings.models import Rating

UNDO_MINUTES = 10

Stock = dict[int, tuple[float, date]]


async def stock_of(session: AsyncSession, household_id: int, ids: set[int]) -> Stock:
    rows = await session.scalars(
        select(InventoryItem).where(
            InventoryItem.household_id == household_id, InventoryItem.ingredient_id.in_(ids)
        )
    )
    return {r.ingredient_id: (r.grams, r.expires_on) for r in rows}


async def ran_out_of(session: AsyncSession, household_id: int) -> set[int]:
    query = select(RanOut.ingredient_id).where(RanOut.household_id == household_id)
    return set(await session.scalars(query))


def undo_record(
    job_id: int | None, before: Stock, after: Stock, ran_before: set[int], ran_after: set[int]
) -> dict:
    taken = [
        {"ingredient_id": iid, "grams": round(g - after.get(iid, (0.0, d))[0], 3), "expires_on": d}
        for iid, (g, d) in before.items()
        if g - after.get(iid, (0.0, d))[0] > 0
    ]
    return {
        "job_id": job_id,
        "taken": [t | {"expires_on": t["expires_on"].isoformat()} for t in taken],
        "ran_out": sorted(ran_after - ran_before),
    }


def undo_until(meal: Meal) -> datetime | None:
    if meal.undo is None or meal.created_at is None:
        return None
    return meal.created_at + timedelta(minutes=UNDO_MINUTES)


async def _in_use(session: AsyncSession, meal_id: int) -> bool:
    plate = select(MealComponent.id).where(MealComponent.component_id == meal_id)
    eaten = select(FoodLog.id).where(FoodLog.meal_id == meal_id)
    cooked = select(CookLog.id).where(CookLog.meal_id == meal_id)
    return any([await session.scalar(q.limit(1)) for q in (plate, eaten, cooked)])


async def undo_post(session: AsyncSession, user: User, meal: Meal) -> int | None:
    """Returns the photo's analysis id (to check it again), or None for a meal without photo."""
    until = undo_until(meal)
    if until is None or datetime.now(UTC) > until:
        raise HTTPException(status.HTTP_409_CONFLICT, "This post can't be undone anymore")
    if meal.created_by != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only who posted it can undo it")
    others = await session.scalar(
        select(User.name)
        .join(FoodLog, FoodLog.user_id == User.id)
        .where(FoodLog.meal_id == meal.id, FoodLog.user_id != user.id)
        .limit(1)
    )
    if others:
        raise HTTPException(status.HTTP_409_CONFLICT, f"{others} logged it too, so it stays")

    record = meal.undo
    for t in record["taken"]:
        item = await session.scalar(
            select(InventoryItem).where(
                InventoryItem.household_id == meal.household_id,
                InventoryItem.ingredient_id == t["ingredient_id"],
            )
        )
        if item is None:
            session.add(
                InventoryItem(
                    household_id=meal.household_id,
                    ingredient_id=t["ingredient_id"],
                    grams=t["grams"],
                    expires_on=date.fromisoformat(t["expires_on"]),
                )
            )
        else:
            item.grams += t["grams"]
    if record["ran_out"]:
        await session.execute(
            delete(RanOut).where(
                RanOut.household_id == meal.household_id,
                RanOut.ingredient_id.in_(record["ran_out"]),
            )
        )

    job = await session.get(AnalysisJob, record["job_id"]) if record["job_id"] else None
    if job is not None:
        job.closed_at, job.meal_id = None, None
        for r in await session.scalars(select(Rating).where(Rating.meal_id == meal.id)):
            session.add(
                AnalysisRating(
                    job_id=job.id,
                    user_id=r.user_id,
                    taste=r.taste,
                    again=r.again,
                    effort=r.effort,
                    fill=r.fill,
                    note=r.note,
                )
            )
    await session.execute(delete(FoodLog).where(FoodLog.meal_id == meal.id))
    await session.delete(meal)  # cook log, ratings, "you too?" suggestions go with it
    await session.flush()
    for dish_id in record.get("components", []):  # dishes made in this post, unless used since
        dish = await session.get(Meal, dish_id)
        if dish is not None and not await _in_use(session, dish_id):
            await session.delete(dish)
    await session.commit()
    return job.id if job is not None else None
