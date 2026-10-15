"""Map a free-text ingredient name (from the vision model) to an Ingredient row.

Heuristic, in order:
1. exact name or alias (case-insensitive) → score 1.0; hand-picked rows first, then the full
   USDA/Ciqual import ("coconut oil" is its own row there, not "Coconut")
2. trigram match over the name and every alias of the hand-picked rows only: accept when a
   whole known term appears in the phrase ("grilled chicken breast" → "Chicken breast",
   word_similarity ≥ 0.8) or the strings are close overall (similarity ≥ 0.5). Sharing one
   word ("mystery sauce" / "soy sauce") is not enough: no match beats a wrong match, the user
   picks the ingredient instead. Ties go to the term closest to the whole phrase ("ground
   black pepper": "black pepper" beats "pepper"), then to the shorter name. The ~10,000
   imported rows have long database names ("Squash, summer, zucchini, includes skin, raw")
   that fuzzy-match too much (decision 0022).
"""

import re
from dataclasses import dataclass

from sqlalchemy import any_, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.nutrition.models import Ingredient

MIN_WORD_SIMILARITY = 0.8
MIN_SIMILARITY = 0.5

_FUZZY = text(
    """
    SELECT id, greatest(sim, wsim) AS score, sim FROM (
        SELECT i.id, length(i.name) AS len,
               similarity(t.term, :q) AS sim, word_similarity(t.term, :q) AS wsim
        FROM ingredient i
        CROSS JOIN LATERAL unnest(array_append(i.aliases, lower(i.name))) AS t(term)
        WHERE i.curated AND i.household_id IS NULL
    ) s
    WHERE wsim >= :min_wsim OR sim >= :min_sim
    ORDER BY score DESC, sim DESC, len
    LIMIT 1
    """
)


@dataclass(frozen=True)
class Match:
    ingredient: Ingredient
    score: float  # 1.0 for exact name/alias, else trigram score


def normalize(name: str) -> str:
    return re.sub(r"\s+", " ", name.strip().lower())


async def match_ingredient(session: AsyncSession, name: str) -> Match | None:
    query = normalize(name)
    if not query:
        return None

    exact = await session.scalar(
        select(Ingredient)
        .where((func.lower(Ingredient.name) == query) | (query == any_(Ingredient.aliases)))
        .where(Ingredient.household_id.is_(None))  # households' own products stay theirs
        .order_by(Ingredient.curated.desc(), Ingredient.id)
        .limit(1)
    )
    if exact is not None:
        return Match(exact, 1.0)

    row = (
        await session.execute(
            _FUZZY, {"q": query, "min_wsim": MIN_WORD_SIMILARITY, "min_sim": MIN_SIMILARITY}
        )
    ).first()
    if row is None:
        return None
    return Match(await session.get(Ingredient, row.id), float(row.score))
