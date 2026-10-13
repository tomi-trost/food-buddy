"""Household portion priors: what we usually end up posting for an ingredient the model keeps
getting wrong (e.g. it says 150 g rice, we always correct to ~180 g). Fed into the meal prompt."""

from collections import defaultdict
from dataclasses import dataclass
from statistics import median

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.analysis.models import AnalysisJob
from app.meals.models import Meal

RECENT_JOBS = 40  # posted analyses to learn from
PER_INGREDIENT = 5  # latest observations per ingredient (habits change)
MIN_SEEN = 2
MIN_CORRECTION = 0.15  # median relative change before it counts as "the model gets it wrong"
MAX_PRIORS = 8  # every prompt token costs time on the 2-core VM


@dataclass(frozen=True)
class Prior:
    ingredient_id: int
    name: str
    grams: int  # usual amount on one plate
    seen: int


async def portion_priors(session: AsyncSession, household_id: int) -> list[Prior]:
    jobs = list(
        await session.scalars(
            select(AnalysisJob)
            .where(
                AnalysisJob.household_id == household_id,
                AnalysisJob.kind == "meal",
                AnalysisJob.meal_id.is_not(None),
                AnalysisJob.result.is_not(None),
            )
            .order_by(AnalysisJob.id.desc())
            .limit(RECENT_JOBS)
        )
    )
    meals = {
        m.id: m
        for m in await session.scalars(select(Meal).where(Meal.id.in_([j.meal_id for j in jobs])))
    }
    # ingredient id → (model's guess, what we posted), newest first
    seen: dict[int, list[tuple[float, float]]] = defaultdict(list)
    names: dict[int, str] = {}
    for job in jobs:
        meal = meals.get(job.meal_id)
        if meal is None or meal.portions < 1:
            continue
        guess: dict[int, float] = defaultdict(float)
        for item in job.result.get("items", []):
            if item.get("ingredient"):
                guess[item["ingredient"]["id"]] += item["grams"]
        for mi in meal.ingredients:
            g = guess.get(mi.ingredient_id, 0)
            if g > 0 and len(seen[mi.ingredient_id]) < PER_INGREDIENT:
                seen[mi.ingredient_id].append((g, mi.grams / meal.portions))  # recipe → one plate
                names[mi.ingredient_id] = mi.ingredient.name
    priors = [
        Prior(iid, names[iid].lower(), int(round(median(p for _, p in obs) / 5) * 5), len(obs))
        for iid, obs in seen.items()
        if len(obs) >= MIN_SEEN and median(abs(p / g - 1) for g, p in obs) > MIN_CORRECTION
    ]
    priors = [p for p in priors if p.grams > 0]
    priors.sort(key=lambda p: (-p.seen, p.name))
    return priors[:MAX_PRIORS]


def priors_hint(priors: list[Prior]) -> str:
    """One line for the prompt, or "" when there's nothing learned yet."""
    if not priors:
        return ""
    usual = ", ".join(f"{p.name} {p.grams} g" for p in priors)
    return f"This household's usual portions on one plate (from their corrections): {usual}."
