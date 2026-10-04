from fastapi import APIRouter, Query
from sqlalchemy import false, func, or_, select

from app.auth.deps import CurrentUser, Session
from app.nutrition.matching import normalize
from app.nutrition.models import Ingredient
from app.nutrition.schemas import IngredientOut

router = APIRouter(prefix="/ingredients", tags=["nutrition"])


@router.get("")
async def search_ingredients(
    session: Session,
    _: CurrentUser,
    q: str = "",
    limit: int = Query(default=30, ge=1, le=100),
) -> list[IngredientOut]:
    """Prefix matches first, then fuzzy ones; empty query lists everything by name."""
    query = normalize(q)
    stmt = select(Ingredient)
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
            prefix.desc(),
            contains.desc(),
            func.word_similarity(query, name).desc(),
            Ingredient.name,
        )
    else:
        stmt = stmt.order_by(Ingredient.name)
    rows = await session.scalars(stmt.limit(limit))
    return [IngredientOut.of(i) for i in rows]
