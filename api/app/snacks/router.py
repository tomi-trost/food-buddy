from datetime import date, timedelta

from fastapi import APIRouter, HTTPException, Response, status
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import nulls_last, select

from app.analysis.queue import close, lock_open_job
from app.auth.deps import CurrentUser, Session
from app.auth.service import household_members
from app.barcode.service import remember
from app.config import get_settings
from app.logs.models import FoodLog
from app.logs.router import is_treat
from app.logs.service import snack_nutrients
from app.snacks import saved
from app.snacks.catalog import CATALOG, CROISSANT, CatalogItem
from app.snacks.models import SavedSnack
from app.snacks.schemas import SavedSnackOut, SavedSnackPatch, SnackIn

router = APIRouter(tags=["snacks"])

WINDOW_DAYS = 7  # croissants are earned and capped over a rolling week


class LoggedOut(BaseModel):
    id: int
    name: str
    kcal: float
    sugar: float
    treat: bool
    saved_id: int | None = None  # in our snacks (saved now or logged from there)


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
    from_list = await saved.get_own(session, user, body.saved_id) if body.saved_id else None
    photo_path = None
    if body.analysis_id is not None:
        job = await lock_open_job(session, user, body.analysis_id)
        close(job)
        photo_path = job.photo_path
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
        per=body.per,
        servings=body.amount,
        per_unit=body.per_unit.model_dump(),
    )
    entry.set_nutrients(snack_nutrients(entry))
    session.add(entry)
    if body.barcode is not None:
        values, grams = body.per_unit.model_dump(), body.amount
        if body.piece_g:  # counted: remember per 100 g/ml and the amount eaten, like a weighed one
            values = {k: round(v * 100 / body.piece_g, 2) for k, v in values.items()}
            grams = body.amount * body.piece_g
        per = body.piece_base if body.piece_g else body.per
        await remember(
            session, user, body.barcode, entry.name, body.kind, values, grams, body.piece_g, per
        )
    kept = await saved.save(session, user, body, photo_path) if body.save else from_list
    if from_list is not None:
        saved.eaten(from_list, body.eaten_on)
    await session.commit()
    return LoggedOut(
        id=entry.id,
        name=entry.name,
        kcal=entry.kcal,
        sugar=entry.sugar,
        treat=is_treat(entry),
        saved_id=kept.id if kept else None,
    )


@router.get("/snacks/saved")
async def list_saved(user: CurrentUser, session: Session) -> list[SavedSnackOut]:
    """Most recently eaten first."""
    rows = await session.scalars(
        select(SavedSnack)
        .where(SavedSnack.household_id == user.household_id)
        .order_by(nulls_last(SavedSnack.last_eaten_on.desc()), SavedSnack.name)
    )
    return [saved.saved_out(s) for s in rows]


@router.patch("/snacks/saved/{saved_id}")
async def edit_saved(
    saved_id: int, body: SavedSnackPatch, user: CurrentUser, session: Session
) -> SavedSnackOut:
    snack = await saved.get_own(session, user, saved_id)
    changes = body.model_dump(exclude_unset=True)
    if "name" in changes:
        changes["name"] = changes["name"].strip()
        other = await saved.by_name(session, user.household_id, changes["name"])
        if other is not None and other.id != snack.id:
            raise HTTPException(
                status.HTTP_409_CONFLICT, "You already saved a snack with this name"
            )
    for key, value in changes.items():
        if value is not None:
            setattr(snack, key, value)
    await session.commit()
    return saved.saved_out(snack)


@router.delete("/snacks/saved/{saved_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_saved(saved_id: int, user: CurrentUser, session: Session) -> Response:
    """Past days keep their entries (they hold their own values)."""
    await session.delete(await saved.get_own(session, user, saved_id))
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/snacks/saved/{saved_id}/photo", response_class=FileResponse)
async def saved_photo(saved_id: int, user: CurrentUser, session: Session) -> FileResponse:
    snack = await saved.get_own(session, user, saved_id)
    if not snack.photo_path:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "This snack has no photo")
    return FileResponse(get_settings().photo_dir / snack.photo_path, media_type="image/jpeg")


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
