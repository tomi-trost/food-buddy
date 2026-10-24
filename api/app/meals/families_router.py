from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.auth.deps import CurrentUser, Session
from app.meals.families import Learned, household_families
from app.meals.models import FamilyBlock

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
