"""The mock's quick-pick snack list (values per piece/portion)."""

from pydantic import BaseModel

from app.snacks.schemas import NutrientsIn, SnackKind


class CatalogItem(BaseModel):
    key: str
    name: str
    emoji: str
    kind: SnackKind
    per_unit: NutrientsIn


def _n(kcal, protein, carbs, fat, fiber, sugar) -> NutrientsIn:
    return NutrientsIn(kcal=kcal, protein=protein, carbs=carbs, fat=fat, fiber=fiber, sugar=sugar)


CATALOG = [
    CatalogItem(
        key="chocolate",
        name="Chocolate bar",
        emoji="🍫",
        kind="sweet",
        per_unit=_n(230, 3, 26, 13, 1.5, 24),
    ),
    CatalogItem(
        key="cookie", name="Cookie", emoji="🍪", kind="sweet", per_unit=_n(140, 2, 19, 6, 0.5, 10)
    ),
    CatalogItem(
        key="icecream",
        name="Ice cream",
        emoji="🍦",
        kind="sweet",
        per_unit=_n(210, 3, 24, 11, 0.5, 22),
    ),
    CatalogItem(
        key="candy", name="Candy", emoji="🍬", kind="sweet", per_unit=_n(60, 0, 15, 0, 0, 15)
    ),
    CatalogItem(
        key="cake", name="Cake slice", emoji="🍰", kind="sweet", per_unit=_n(350, 4, 45, 17, 1, 30)
    ),
    CatalogItem(
        key="proteinbar",
        name="Protein bar",
        emoji="🍫",
        kind="sweet",
        per_unit=_n(200, 20, 20, 7, 5, 8),
    ),
    CatalogItem(
        key="soda", name="Soda", emoji="🥤", kind="drink", per_unit=_n(140, 0, 35, 0, 0, 35)
    ),
    CatalogItem(
        key="chips", name="Chips", emoji="🥔", kind="savory", per_unit=_n(210, 2, 22, 13, 2, 1)
    ),
    CatalogItem(
        key="nuts",
        name="Handful of nuts",
        emoji="🥜",
        kind="savory",
        per_unit=_n(170, 6, 6, 15, 2, 1),
    ),
    CatalogItem(
        key="popcorn",
        name="Popcorn",
        emoji="🍿",
        kind="savory",
        per_unit=_n(110, 3, 22, 1.5, 4, 0.5),
    ),
]

CROISSANT = CatalogItem(
    key="croissant",
    name="Croissant (reward)",
    emoji="🥐",
    kind="sweet",
    per_unit=_n(230, 5, 26, 12, 1.5, 6),
)
