"""Deterministic weekly menu generator (mock rules, decision in design-plan §4.5).

Pure functions over small dataclasses so the rules are easy to test without a database.
"""

import math
from dataclasses import dataclass, field

MEAL_TYPES = ("breakfast", "lunch", "dinner")
EATERS_PER_SLOT = 2  # a slot feeds both of us
UNRATED_SCORE = 3.0  # unrated meals rank like an average one


@dataclass(frozen=True)
class Candidate:
    id: int
    types: tuple[str, ...]
    prep_minutes: int
    portions: int
    score: float | None
    tags: tuple[str, ...] = ()


@dataclass
class Slot:
    mode: str  # cook|prep|out|skip
    minutes: int | None = None
    meal_id: int | None = None


@dataclass
class Week:
    days: list[dict[str, Slot]] = field(default_factory=list)


def _rank(c: Candidate) -> tuple[float, int]:
    return (-(c.score if c.score is not None else UNRATED_SCORE), c.id)


def eligible(meals: list[Candidate], meal_type: str, minutes: int, exclude=()) -> list[Candidate]:
    return sorted(
        (
            m
            for m in meals
            if meal_type in m.types and m.prep_minutes <= minutes and m.id not in exclude
        ),
        key=_rank,
    )


def prep_options(meals: list[Candidate], meal_type: str) -> list[Candidate]:
    return sorted(
        (m for m in meals if meal_type in m.types and "prep-friendly" in m.tags), key=_rank
    )


def generate(meals: list[Candidate], wizard: list[list[dict]]) -> Week:
    """wizard: 7 days × [breakfast, lunch, dinner] of {"mode", "minutes"}.

    Cook slots take the best-rated meal that fits the time and hasn't been used this week;
    once every fitting meal is used, repeats are allowed. Prep slots take the best
    prep-friendly meal (the batch is cooked once and eaten several times).
    """
    used: list[int] = []
    week = Week()
    for row in wizard:
        day: dict[str, Slot] = {}
        for meal_type, cell in zip(MEAL_TYPES, row, strict=True):
            mode, minutes = cell["mode"], cell.get("minutes")
            if mode == "cook":
                options = eligible(meals, meal_type, minutes, used) or eligible(
                    meals, meal_type, minutes
                )
                meal = options[0] if options else None
                if meal:
                    used.append(meal.id)
                day[meal_type] = Slot("cook", minutes, meal.id if meal else None)
            elif mode == "prep":
                options = prep_options(meals, meal_type)
                day[meal_type] = Slot("prep", None, options[0].id if options else None)
            else:
                day[meal_type] = Slot(mode)
        week.days.append(day)
    return week


def batches(meal_ids: list[int], portions: dict[int, int]) -> dict[int, int]:
    """How many times each meal must be cooked: 2 portions per slot, rounded up per recipe."""
    needed: dict[int, int] = {}
    for mid in meal_ids:
        needed[mid] = needed.get(mid, 0) + EATERS_PER_SLOT
    return {mid: math.ceil(n / portions[mid]) for mid, n in needed.items()}


def round_up_to(grams: float, step: int = 50) -> int:
    return int(math.ceil(max(grams, 0) / step) * step)
