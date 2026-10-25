from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.auth.deps import CurrentUser, Session
from app.meals.families import Learned, household_families
from app.meals.models import FamilyBlock, Meal

router = APIRouter(prefix="/families", tags=["meals"])


class Named(BaseModel):
    id: int
    name: str


class FamilyOut(BaseModel):
    """A family we put meals in, and what it learned from them to guess new ones."""

    name: str
    members: int  # meals we put in it ourselves
    words: list[str]
    ingredients: list[Named]
    blocked_words: list[str]
    blocked_ingredients: list[Named]


class BlocksIn(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    blocked_words: list[str] = Field(default_factory=list, max_length=50)
    blocked_ingredients: list[int] = Field(default_factory=list, max_length=50)


class RenameIn(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    to: str = Field(min_length=1, max_length=40)


class Renamed(BaseModel):
    name: str
    meals: int  # now picked into it


def family_out(f: Learned) -> FamilyOut:
    named = lambda d: [Named(id=i, name=n) for i, n in sorted(d.items(), key=lambda x: x[1])]  # noqa: E731
    return FamilyOut(
        name=f.name,
        members=f.members,
        words=sorted(f.words),
        ingredients=named(f.ingredients),
        blocked_words=sorted(f.blocked_words),
        blocked_ingredients=named(f.blocked_ingredients),
    )


@router.get("")
async def list_families(user: CurrentUser, session: Session) -> list[FamilyOut]:
    return [family_out(f) for f in (await household_families(session, user.household_id)).learned]


@router.put("/blocks")
async def set_blocks(body: BlocksIn, user: CurrentUser, session: Session) -> FamilyOut:
    """Stop (or start again) matching new meals on these words / ingredients."""
    families = await household_families(session, user.household_id)
    if body.name not in {f.name for f in families.learned}:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No meals of ours are in this family")
    block = await session.scalar(
        select(FamilyBlock).where(
            FamilyBlock.household_id == user.household_id, FamilyBlock.name == body.name
        )
    )
    if block is None:
        block = FamilyBlock(household_id=user.household_id, name=body.name)
        session.add(block)
    block.blocked_words = sorted({w.strip().lower() for w in body.blocked_words if w.strip()})
    block.blocked_ingredients = sorted(set(body.blocked_ingredients))
    await session.commit()
    learned = (await household_families(session, user.household_id)).learned
    return family_out(next(f for f in learned if f.name == body.name))


@router.put("/rename")
async def rename_family(body: RenameIn, user: CurrentUser, session: Session) -> Renamed:
    """Every meal in the family (picked or guessed) is put in `to`; one that's there already
    merges them. What it was told to ignore moves along."""
    to = body.to.strip()
    if not to:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Give the family a name")
    families = await household_families(session, user.household_id)
    meals = [
        m
        for m in await session.scalars(select(Meal).where(Meal.household_id == user.household_id))
        if families.of(m) == body.name
    ]
    if not meals:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No meals of ours are in this family")
    for m in meals:
        m.family = to
    blocks = {
        b.name: b
        for b in await session.scalars(
            select(FamilyBlock).where(
                FamilyBlock.household_id == user.household_id,
                FamilyBlock.name.in_([body.name, to]),
            )
        )
    }
    old, there = blocks.get(body.name), blocks.get(to)
    if old is not None and to != body.name:
        if there is None:
            old.name = to
        else:
            there.blocked_words = sorted({*there.blocked_words, *old.blocked_words})
            there.blocked_ingredients = sorted(
                {*there.blocked_ingredients, *old.blocked_ingredients}
            )
            await session.delete(old)
    await session.commit()
    return Renamed(name=to, meals=len(meals))
