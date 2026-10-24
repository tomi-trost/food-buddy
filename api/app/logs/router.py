from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import Literal

from fastapi import APIRouter, HTTPException, Query, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select

from app.auth.deps import CurrentUser, Session
from app.auth.router import GoalsOut
from app.auth.service import household_members
from app.logs.models import FoodLog
from app.logs.service import snack_nutrients
from app.logs.sources import sources
from app.meals.models import CookLog, Meal
from app.meals.service import per_portion
from app.nutrition.macros import Nutrients, total
from app.nutrition.schemas import NutrientsOut
from app.ratings.models import Rating
from app.snacks.schemas import NutrientsIn

router = APIRouter(tags=["logs"])

TREAT_KINDS = (
    "sweet",
    "drink",
)  # sweets and sugary drinks count as treats (0014); fruit doesn't (0024)


class LogEntry(BaseModel):
    id: int
    meal_type: str
    name: str
    emoji: str
    kind: str
    snack_kind: str | None
    is_reward: bool
    meal_id: int | None
    nutrients: NutrientsOut
    logged_at: datetime  # when it was logged: places snacks between the meals
    servings: float  # portions (meals), amount (snacks: portions, pieces, grams or ml)
    per: str | None  # snacks: portion | piece | 100g | 100ml
    per_unit: NutrientsOut | None  # snacks: values per portion / piece / 100 g / 100 ml


class LogPatch(BaseModel):
    """Meals: portions eaten and which meal it was. Snacks: amount and values per unit."""

    servings: float | None = Field(default=None, gt=0, le=2000)
    meal_type: Literal["breakfast", "lunch", "dinner"] | None = None
    per_unit: NutrientsIn | None = None


def entry_out(e: FoodLog) -> LogEntry:
    return LogEntry(
        id=e.id,
        meal_type=e.meal_type,
        name=e.name,
        emoji=e.emoji,
        kind=e.kind,
        snack_kind=e.snack_kind,
        is_reward=e.is_reward,
        meal_id=e.meal_id,
        nutrients=NutrientsOut(**e.nutrients.rounded()),
        logged_at=e.created_at,
        servings=e.servings,
        per=e.per,
        per_unit=NutrientsOut(**e.per_unit) if e.per_unit else None,
    )


class DayOut(BaseModel):
    date: date
    totals: NutrientsOut
    entries: list[LogEntry]


class DayTotals(NutrientsOut):
    date: date
    treats: int  # sweets + sugary drinks, croissant rewards excluded
    treat_sugar: float


class NotCooked(BaseModel):
    """Over the range: food eaten out and bought, and what it cost (portions × price paid)."""

    out: int = 0
    bought: int = 0
    spent: float = 0


class MemberInsights(BaseModel):
    user_id: int
    name: str
    color: str
    goals: GoalsOut
    meals_rated: int
    days: list[DayTotals]  # oldest → newest, every day present
    not_cooked: NotCooked
    meal_counts: dict[str, int]  # breakfast | lunch | dinner | snack → entries over the range


class InsightsOut(BaseModel):
    members: list[MemberInsights]


def is_treat(entry: FoodLog) -> bool:
    return entry.kind == "snack" and entry.snack_kind in TREAT_KINDS and not entry.is_reward


@router.get("/day")
async def my_day(user: CurrentUser, session: Session, date: date) -> DayOut:
    entries = list(
        await session.scalars(
            select(FoodLog)
            .where(FoodLog.user_id == user.id, FoodLog.eaten_on == date)
            .order_by(FoodLog.id)
        )
    )
    return DayOut(
        date=date,
        totals=NutrientsOut(**total(e.nutrients for e in entries).rounded()),
        entries=[entry_out(e) for e in entries],
    )


async def own_entry(session, user, entry_id: int) -> FoodLog:
    entry = await session.get(FoodLog, entry_id)
    if entry is None or entry.user_id != user.id:  # only what I ate, not my partner's
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Entry not found")
    return entry


@router.patch("/log/{entry_id}")
async def edit_entry(
    entry_id: int, body: LogPatch, user: CurrentUser, session: Session
) -> LogEntry:
    entry = await own_entry(session, user, entry_id)
    if entry.kind == "meal":
        if body.per_unit is not None:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT, "A meal's values are edited on the meal"
            )
        if body.servings is not None:
            if body.servings > 10 or body.servings * 2 != int(body.servings * 2):
                raise HTTPException(
                    status.HTTP_422_UNPROCESSABLE_CONTENT, "Portions go in halves, up to 10"
                )
            meal = await session.get(Meal, entry.meal_id) if entry.meal_id else None
            # meal deleted but entry kept: scale what was logged
            per_one = per_portion(meal) if meal else entry.nutrients.scaled(100 / entry.servings)
            entry.servings = body.servings
            entry.set_nutrients(per_one.scaled(body.servings * 100))
        if body.meal_type is not None:
            entry.meal_type = body.meal_type
    else:
        if body.meal_type is not None:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Snacks stay snacks")
        if body.servings is not None:
            entry.servings = body.servings
        if body.per_unit is not None:
            if entry.meal_id is not None:
                raise HTTPException(
                    status.HTTP_422_UNPROCESSABLE_CONTENT,
                    "This snack's values are edited on the snack, under Meals",
                )
            entry.per_unit = body.per_unit.model_dump()
        entry.set_nutrients(snack_nutrients(entry))
    await session.commit()
    return entry_out(entry)


@router.delete("/log/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_entry(entry_id: int, user: CurrentUser, session: Session) -> Response:
    """Off the day. A meal stays in the library; its cook count drops by this one."""
    entry = await own_entry(session, user, entry_id)
    if entry.meal_id is not None:
        cook = await session.scalar(
            select(CookLog.id)
            .where(
                CookLog.meal_id == entry.meal_id,
                CookLog.user_id == user.id,
                CookLog.cooked_on == entry.eaten_on,
            )
            .limit(1)
        )
        if cook is not None:
            await session.execute(delete(CookLog).where(CookLog.id == cook))
    await session.delete(entry)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def meal_counts(rows: list[FoodLog], user_id: int) -> dict[str, int]:
    counts = dict.fromkeys(("breakfast", "lunch", "dinner", "snack"), 0)
    for r in rows:
        if r.user_id == user_id and not r.is_reward:
            counts[r.meal_type] = counts.get(r.meal_type, 0) + 1
    return counts


class SourceItem(BaseModel):
    name: str
    emoji: str
    times: int  # eaten entries that had it
    grams: float


class SourcesOut(BaseModel):
    groups: dict[str, list[SourceItem]]  # protein | carbs | fat | fiber | sugar


@router.get("/insights/sources")
async def insights_sources(
    user: CurrentUser,
    session: Session,
    end: date,
    user_id: int,
    days: int = Query(default=7, ge=1, le=92),
) -> SourcesOut:
    """The ingredients someone in the household ate most, grouped by the nutrient they bring."""
    if user_id not in {m.id for m in await household_members(session, user.household_id)}:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not in your household")
    start = end - timedelta(days=days - 1)
    grouped = await sources(session, user.household_id, user_id, start, end)
    return SourcesOut(
        groups={
            g: [
                SourceItem(
                    name=t.ingredient.name,
                    emoji=t.ingredient.emoji or "",
                    times=t.times,
                    grams=round(t.grams),
                )
                for t in items
            ]
            for g, items in grouped.items()
        }
    )


async def not_cooked_by_user(session, rows: list[FoodLog]) -> dict[int, NotCooked]:
    ids = {r.meal_id for r in rows if r.meal_id}
    meals = {
        m.id: m
        for m in await session.scalars(select(Meal).where(Meal.id.in_(ids), Meal.origin != "home"))
    }
    out: dict[int, NotCooked] = defaultdict(NotCooked)
    for r in rows:
        meal = meals.get(r.meal_id)
        if meal is None:
            continue
        mine = out[r.user_id]
        if meal.origin == "out":
            mine.out += 1
        else:
            mine.bought += 1
        mine.spent = round(mine.spent + (meal.cost or 0) * r.servings / meal.portions, 2)
    return out


@router.get("/insights")
async def insights(
    user: CurrentUser, session: Session, end: date, days: int = Query(default=7, ge=1, le=92)
) -> InsightsOut:
    """Daily totals for every household member over `days` days ending on `end` (inclusive)."""
    start = end - timedelta(days=days - 1)
    rows = await session.scalars(
        select(FoodLog).where(
            FoodLog.household_id == user.household_id,
            FoodLog.eaten_on >= start,
            FoodLog.eaten_on <= end,
        )
    )
    by_user_day: dict[tuple[int, date], list[FoodLog]] = defaultdict(list)
    rows = list(rows)
    for r in rows:
        by_user_day[(r.user_id, r.eaten_on)].append(r)
    not_cooked = await not_cooked_by_user(session, rows)

    rated = dict(
        (
            await session.execute(
                select(Rating.user_id, func.count())
                .join(Meal, Meal.id == Rating.meal_id)
                .where(Meal.household_id == user.household_id)
                .group_by(Rating.user_id)
            )
        ).all()
    )
    members = []
    for m in await household_members(session, user.household_id):
        series = []
        for i in range(days):
            day = start + timedelta(days=i)
            entries = by_user_day.get((m.id, day), [])
            sums = total(e.nutrients for e in entries) if entries else Nutrients()
            treats = [e for e in entries if is_treat(e)]
            series.append(
                DayTotals(
                    date=day,
                    **sums.rounded(),
                    treats=len(treats),
                    treat_sugar=round(sum(e.sugar for e in treats), 1),
                )
            )
        members.append(
            MemberInsights(
                user_id=m.id,
                name=m.name,
                color=m.color,
                goals=GoalsOut(
                    kcal=m.goal_kcal, protein=m.goal_protein, fiber=m.goal_fiber, sugar=m.goal_sugar
                ),
                meals_rated=rated.get(m.id, 0),
                days=series,
                not_cooked=not_cooked.get(m.id, NotCooked()),
                meal_counts=meal_counts(rows, m.id),
            )
        )
    return InsightsOut(members=members)
