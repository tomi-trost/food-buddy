from datetime import date, timedelta

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select

from app.auth.deps import CurrentUser, Session
from app.auth.service import household_members
from app.logs.models import FoodLog
from app.logs.router import is_treat
from app.nutrition.macros import Nutrients
from app.snacks.catalog import CATALOG, CROISSANT, CatalogItem
from app.snacks.schemas import SnackIn

router = APIRouter(tags=["snacks"])

WINDOW_DAYS = 7  # croissants are earned and capped over a rolling week


class LoggedOut(BaseModel):
    id: int
    name: str
    kcal: float
    sugar: float
    treat: bool


class RewardOut(BaseModel):
    user_id: int
    name: str
    color: str
    treat_free_days: int  # last 7 days before today with food logged and no treats
    earned: int
    used: int
    available: int
    progress: int  # treat-free days towards the next croissant
    per: int


@router.get("/snacks/catalog")
async def catalog(_: CurrentUser) -> list[CatalogItem]:
    return CATALOG


@router.post("/snacks", status_code=status.HTTP_201_CREATED)
async def log_snack(body: SnackIn, user: CurrentUser, session: Session) -> LoggedOut:
    factor = body.amount if body.per == "piece" else body.amount / 100
    nutrients = Nutrients(**body.per_unit.model_dump()).scaled(factor * 100)
    entry = FoodLog(
        household_id=user.household_id,
        user_id=user.id,
        eaten_on=body.eaten_on,
        meal_type="snack",
        name=body.name.strip(),
        emoji=body.emoji,
        kind="snack",
        snack_kind=body.kind,
        source=body.source,
    )
    entry.set_nutrients(nutrients)
    session.add(entry)
    await session.commit()
    return LoggedOut(
        id=entry.id, name=entry.name, kcal=entry.kcal, sugar=entry.sugar, treat=is_treat(entry)
    )


async def rewards_for(session, user, today: date) -> list[RewardOut]:
    start = today - timedelta(days=WINDOW_DAYS)
    rows = list(
        await session.scalars(
            select(FoodLog).where(
                FoodLog.household_id == user.household_id,
                FoodLog.eaten_on >= start,
                FoodLog.eaten_on <= today,
            )
        )
    )
    household = user.household
    out = []
    for m in await household_members(session, user.household_id):
        mine = [r for r in rows if r.user_id == m.id]
        free = 0
        for i in range(1, WINDOW_DAYS + 1):
            day = today - timedelta(days=i)
            entries = [r for r in mine if r.eaten_on == day]
            if entries and not any(is_treat(e) for e in entries):
                free += 1
        earned = min(free // household.reward_per, household.reward_cap)
        used = sum(1 for r in mine if r.is_reward and r.eaten_on > start)
        out.append(
            RewardOut(
                user_id=m.id,
                name=m.name,
                color=m.color,
                treat_free_days=free,
                earned=earned,
                used=used,
                available=max(earned - used, 0),
                progress=free % household.reward_per,
                per=household.reward_per,
            )
        )
    return out


@router.get("/rewards")
async def rewards(user: CurrentUser, session: Session, today: date) -> list[RewardOut]:
    return await rewards_for(session, user, today)


class UseIn(BaseModel):
    today: date


@router.post("/rewards/use")
async def use_reward(body: UseIn, user: CurrentUser, session: Session) -> list[RewardOut]:
    mine = next(r for r in await rewards_for(session, user, body.today) if r.user_id == user.id)
    if not mine.available:
        raise HTTPException(status.HTTP_409_CONFLICT, "No croissant pass available yet")
    entry = FoodLog(
        household_id=user.household_id,
        user_id=user.id,
        eaten_on=body.today,
        meal_type="snack",
        name=CROISSANT.name,
        emoji=CROISSANT.emoji,
        kind="snack",
        snack_kind="sweet",
        is_reward=True,
        source="reward",
    )
    entry.set_nutrients(Nutrients(**CROISSANT.per_unit.model_dump()))
    session.add(entry)
    await session.commit()
    return await rewards_for(session, user, body.today)
