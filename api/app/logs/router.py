from collections import defaultdict
from datetime import date, timedelta

from fastapi import APIRouter, Query
from pydantic import BaseModel
from sqlalchemy import func, select

from app.auth.deps import CurrentUser, Session
from app.auth.router import GoalsOut
from app.auth.service import household_members
from app.logs.models import FoodLog
from app.meals.models import Meal
from app.nutrition.macros import Nutrients, total
from app.nutrition.schemas import NutrientsOut
from app.ratings.models import Rating

router = APIRouter(tags=["logs"])

TREAT_KINDS = ("sweet", "drink")  # sweets and sugary drinks count as treats (decision 0014)


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


class DayOut(BaseModel):
    date: date
    totals: NutrientsOut
    entries: list[LogEntry]


class DayTotals(NutrientsOut):
    date: date
    treats: int  # sweets + sugary drinks, croissant rewards excluded
    treat_sugar: float


class MemberInsights(BaseModel):
    user_id: int
    name: str
    color: str
    goals: GoalsOut
    meals_rated: int
    days: list[DayTotals]  # oldest → newest, every day present


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
        entries=[
            LogEntry(
                id=e.id,
                meal_type=e.meal_type,
                name=e.name,
                emoji=e.emoji,
                kind=e.kind,
                snack_kind=e.snack_kind,
                is_reward=e.is_reward,
                meal_id=e.meal_id,
                nutrients=NutrientsOut(**e.nutrients.rounded()),
            )
            for e in entries
        ],
    )


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
    for r in rows:
        by_user_day[(r.user_id, r.eaten_on)].append(r)

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
            )
        )
    return InsightsOut(members=members)
