"""Recipe steps: an instant template (same wording as the mock), later replaced by the model."""

import math

from pydantic import BaseModel, ConfigDict, Field


def _round(x: float) -> int:
    """Half-up rounding, identical to JS Math.round (web/src/lib/recipe.ts)."""
    return math.floor(x + 0.5)


def template_steps(names: list[str], prep_minutes: int, portions: int) -> list[str]:
    """`names` ordered by importance (most grams first)."""
    low = [n.lower() for n in names]
    if not low:
        return [f"Serve in {portions} portions."]
    steps = [
        f"Prep: wash and chop {', '.join(low[:3])}.",
        f"Heat a pan with oil; cook {low[0]} until golden (~{_round(prep_minutes * 0.3)} min).",
    ]
    if len(low) > 1:
        steps.append(
            f"Add {', '.join(low[1:4])} and simmer/stir for {_round(prep_minutes * 0.4)} min."
        )
    steps.append(f"Season, taste, adjust and serve in {portions} portions.")
    return steps


class RecipeAnswer(BaseModel):
    model_config = ConfigDict(extra="forbid")

    steps: list[str] = Field(min_length=2, max_length=10)


RECIPE_SYSTEM_PROMPT = """\
You write short, practical home-cooking recipes.
Use only the given ingredients plus salt, pepper, water and common spices.
3 to 8 steps, one sentence each, in cooking order. Reply with JSON only."""


def recipe_messages(name: str, items: list[tuple[str, float]], minutes: int, portions: int):
    lines = "\n".join(f"- {n}: {round(g)} g" for n, g in items)
    return [
        {"role": "system", "content": RECIPE_SYSTEM_PROMPT},
        {
            "role": "user",
            "content": f"Dish: {name}\nPortions: {portions}\nTime: about {minutes} min\n"
            f"Ingredients:\n{lines}",
        },
    ]
