"""Our snacks: saved while logging (photo snacks keep their photo), logged again from the list."""

from datetime import date

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User
from app.snacks.models import SavedSnack
from app.snacks.schemas import SavedSnackOut, SnackIn


def saved_out(s: SavedSnack) -> SavedSnackOut:
    return SavedSnackOut(
        id=s.id,
        name=s.name,
        emoji=s.emoji,
        kind=s.kind,
        per=s.per,
        amount=s.amount,
        per_unit=s.per_unit,
        photo_url=f"/api/snacks/saved/{s.id}/photo" if s.photo_path else None,
        last_eaten_on=s.last_eaten_on,
    )


async def by_name(session: AsyncSession, household_id: int, name: str) -> SavedSnack | None:
    return await session.scalar(
        select(SavedSnack).where(
            SavedSnack.household_id == household_id,
            func.lower(SavedSnack.name) == name.strip().lower(),
        )
    )


async def get_own(session: AsyncSession, user: User, saved_id: int) -> SavedSnack:
    snack = await session.get(SavedSnack, saved_id)
    if snack is None or snack.household_id != user.household_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Snack not found")
    return snack


async def save(
    session: AsyncSession, user: User, body: SnackIn, photo_path: str | None
) -> SavedSnack:
    """Create or update (same name) from what was just logged; a new photo replaces the old."""
    snack = await by_name(session, user.household_id, body.name)
    if snack is None:  # an existing one keeps its spelling ("Cookie", not "cookie")
        snack = SavedSnack(household_id=user.household_id, created_by=user.id)
        snack.name = body.name.strip()
        session.add(snack)
    snack.emoji = body.emoji
    snack.kind = body.kind
    snack.per = body.per
    snack.amount = body.amount
    snack.per_unit = body.per_unit.model_dump()
    snack.photo_path = photo_path or snack.photo_path
    snack.last_eaten_on = body.eaten_on
    return snack


def eaten(snack: SavedSnack, on: date) -> None:
    if snack.last_eaten_on is None or on > snack.last_eaten_on:
        snack.last_eaten_on = on
