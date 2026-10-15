from datetime import date, timedelta

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select

from app.analysis.queue import close, lock_open_job
from app.auth.deps import CurrentUser, Session
from app.auth.service import household_members
from app.barcode.service import remember, remembered
from app.inventory.service import deduct
from app.logs.models import FoodLog
from app.logs.router import is_treat
from app.logs.service import snack_nutrients
from app.meals.models import CookLog, Meal
from app.snacks.catalog import CATALOG, CROISSANT, CatalogItem
from app.snacks.products import save_product
from app.snacks.schemas import SnackIn

router = APIRouter(tags=["snacks"])

WINDOW_DAYS = 7  # croissants are earned and capped over a rolling week


class LoggedOut(BaseModel):
    id: int
    name: str
    kcal: float
    sugar: float
    treat: bool
    meal_id: int | None = None  # in our snacks: the product meal it was saved to


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
    """Log a snack that isn't one of our meals yet (picked, scanned, label). Saved, or scanned
    again once it is, it becomes or updates a product meal (0025) and the entry links to it."""
    photo_path = None
    if body.analysis_id is not None:
        job = await lock_open_job(session, user, body.analysis_id)
        close(job)
        photo_path = job.photo_path
    known = await remembered(session, user.household_id, body.barcode) if body.barcode else None
    product = await session.get(Meal, known.meal_id) if known and known.meal_id else None
    meal = None
    if body.save or product is not None:
        meal = await save_product(session, user, body, photo_path, product)
    entry = FoodLog(
        household_id=user.household_id,
        user_id=user.id,
        eaten_on=body.eaten_on,
        meal_type="snack",
        name=body.name.strip(),
        emoji=body.emoji,
        meal_id=meal.id if meal else None,
        kind="snack",
        snack_kind=body.kind,
        source=body.source,
        per=body.per,
        servings=body.amount,
        per_unit=body.per_unit.model_dump(),
    )
    entry.set_nutrients(snack_nutrients(entry))
    session.add(entry)
    if meal is not None:  # eaten once more; what's at home goes down
        session.add(CookLog(meal_id=meal.id, user_id=user.id, cooked_on=body.eaten_on))
        grams = body.amount * meal.piece_g if meal.per == "piece" else body.amount
        await deduct(session, user.household_id, {meal.ingredients[0].ingredient_id: grams})
    if body.barcode is not None:
        values, grams = body.per_unit.model_dump(), body.amount
        if body.piece_g:  # counted: remember per 100 g/ml and the amount eaten, like a weighed one
            values = {k: round(v * 100 / body.piece_g, 2) for k, v in values.items()}
            grams = body.amount * body.piece_g
        per = body.piece_base if body.piece_g else body.per
        await remember(
            session,
            user,
            body.barcode,
            entry.name,
            body.kind,
            values,
            grams,
            body.piece_g,
            per,
            meal.id if meal else None,
        )
    await session.commit()
    return LoggedOut(
        id=entry.id,
        name=entry.name,
        kcal=entry.kcal,
        sugar=entry.sugar,
        treat=is_treat(entry),
        meal_id=entry.meal_id,
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
        per="piece",
        servings=1,
        per_unit=CROISSANT.per_unit.model_dump(),
    )
    entry.set_nutrients(snack_nutrients(entry))
    session.add(entry)
    await session.commit()
    return await rewards_for(session, user, body.today)
