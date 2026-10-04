"""Macro math: per-100 g values scaled by grams. Pure functions, no I/O."""

from collections.abc import Iterable
from dataclasses import asdict, dataclass, fields


@dataclass(frozen=True)
class Nutrients:
    kcal: float = 0.0
    protein: float = 0.0
    carbs: float = 0.0
    fat: float = 0.0
    fiber: float = 0.0
    sugar: float = 0.0

    def scaled(self, grams: float) -> "Nutrients":
        """Values for `grams` of a food whose per-100 g values are `self`."""
        if grams < 0:
            raise ValueError("grams must not be negative")
        factor = grams / 100
        return Nutrients(**{f.name: getattr(self, f.name) * factor for f in fields(self)})

    def __add__(self, other: "Nutrients") -> "Nutrients":
        return Nutrients(
            **{f.name: getattr(self, f.name) + getattr(other, f.name) for f in fields(self)}
        )

    def rounded(self) -> dict[str, float]:
        return {k: round(v, 1) for k, v in asdict(self).items()}


def total(items: Iterable[Nutrients]) -> Nutrients:
    result = Nutrients()
    for item in items:
        result = result + item
    return result
