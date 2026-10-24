from typing import Literal

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import false, func, or_, select

from app.auth.deps import CurrentUser, Session
from app.nutrition.matching import normalize
from app.nutrition.models import HouseholdUnit, Ingredient
from app.nutrition.schemas import IngredientOut
from app.nutrition.units import HOUSE_UNITS

router = APIRouter(prefix="/ingredients", tags=["nutrition"])


@router.get("")
async def search_ingredients(
    session: Session,
    user: CurrentUser,
    q: str = "",
    limit: int = Query(default=30, ge=1, le=100),
) -> list[IngredientOut]:
    """Hand-picked foods before the full USDA/Ciqual import; within each prefix matches first,
    then fuzzy ones. An empty query lists everything by name. Our own products (0025) count as
    hand-picked; other households' never show."""
    query = normalize(q)
    stmt = select(Ingredient).where(
        Ingredient.household_id.is_(None) | (Ingredient.household_id == user.household_id)
    )
    if query:
        name = func.lower(Ingredient.name)
        aliases = func.array_to_string(Ingredient.aliases, "|")
        prefix = name.startswith(query, autoescape=True)
        fuzzy = func.word_similarity(query, name) >= 0.4
        contains = name.contains(query, autoescape=True) | aliases.contains(query, autoescape=True)
        # Multi-word phrases from the model ("ground meat") also suggest single-word matches.
        words = [w for w in query.split() if len(w) >= 3] if " " in query else []
        any_word = or_(
            false(),
            *(
                name.contains(w, autoescape=True) | aliases.contains(w, autoescape=True)
                for w in words
            ),
        )
        stmt = stmt.where(prefix | contains | fuzzy | any_word).order_by(
            Ingredient.curated.desc(),
            prefix.desc(),
            contains.desc(),
            func.word_similarity(query, name).desc(),
            Ingredient.name,
        )
    else:
        stmt = stmt.order_by(Ingredient.curated.desc(), Ingredient.name)
    rows = await session.scalars(stmt.limit(limit))
    return [IngredientOut.of(i) for i in rows]


class UnitIn(BaseModel):
    """How we count it from now on: grams, pieces of `unit_grams` g, or ml (`unit_grams` g/ml)."""

    unit: Literal["g", "pc", "ml"]
    unit_grams: float = Field(default=1, gt=0, le=2000)


@router.put("/{ingredient_id}/unit")
async def set_unit(
    ingredient_id: int, body: UnitIn, user: CurrentUser, session: Session
) -> IngredientOut:
    """Count this ingredient our way everywhere (meals, stock, shopping); amounts stay grams."""
    ingredient = await session.get(Ingredient, ingredient_id)
    if ingredient is None or ingredient.household_id not in (None, user.household_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ingredient not found")
    row = await session.scalar(
        select(HouseholdUnit).where(
            HouseholdUnit.household_id == user.household_id,
            HouseholdUnit.ingredient_id == ingredient_id,
        )
    )
    if row is None:
        row = HouseholdUnit(household_id=user.household_id, ingredient_id=ingredient_id)
        session.add(row)
    grams = 1.0 if body.unit == "g" else body.unit_grams
    row.unit, row.unit_grams = body.unit, grams
    await session.commit()
    HOUSE_UNITS.set({**HOUSE_UNITS.get(), ingredient_id: (body.unit, grams)})
    return IngredientOut.of(ingredient)
