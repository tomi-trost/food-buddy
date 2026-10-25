"""How we count an ingredient in the app: grams (default), pieces/slices/cloves, or ml.

Everything is still stored and calculated in grams; this only says how to show and type the
amount: `unit_grams` is the weight of one piece/slice/clove, or the density (g per ml).
Only hand-picked names are listed (the long USDA/Ciqual rows stay in grams).
"""

from collections.abc import Mapping
from contextvars import ContextVar
from types import MappingProxyType
from typing import Literal

Unit = Literal["g", "ml", "pc", "slice", "clove"]

# The signed-in household's own picks (ingredient id → unit, grams per unit), set once per
# request with the user (auth.deps) so every IngredientOut shows amounts the way we count them.
HOUSE_UNITS: ContextVar[Mapping[int, tuple[str, float]]] = ContextVar(
    "house_units", default=MappingProxyType({})
)

# One piece as usually bought/eaten (edible part, medium size)
PIECES: dict[str, float] = {
    "eggs": 50,
    "egg whites": 33,
    "avocado": 150,
    "banana": 120,
    "apple": 180,
    "pear": 180,
    "orange": 150,
    "mandarin": 75,
    "lemon": 85,
    "lime": 65,
    "kiwi": 75,
    "mango": 250,
    "peach": 150,
    "apricot": 35,
    "plum": 65,
    "figs": 50,
    "dates": 8,
    "carrot": 70,
    "cucumber": 300,
    "bell pepper": 150,
    "green bell pepper": 150,
    "yellow bell pepper": 150,
    "chili pepper": 15,
    "zucchini": 200,
    "eggplant": 300,
    "onions": 110,
    "red onion": 110,
    "spring onion": 15,
    "tomatoes": 120,
    "potatoes": 170,
    "sweet potato": 200,
    "artichoke": 120,
    "leek": 150,
    "bread roll": 60,
    "croissant": 60,
    "pita": 60,
    "tortilla": 45,
    "muffin": 110,
    "cookies": 12,
    "pancakes": 40,
    "falafel": 17,
    "grissini": 6,
    "brioche": 50,
    "sausage": 75,
    "hot dog": 50,
    "mozzarella": 125,
    "buffalo mozzarella": 125,
}
SLICES: dict[str, float] = {
    "white bread": 30,
    "whole wheat bread": 30,
    "rye bread": 30,
    "sourdough": 50,
    "ham": 15,
    "bacon": 12,
    "prosciutto": 10,
    "salami": 5,
    "mortadella": 15,
    "cheddar": 20,
    "gouda": 20,
    "emmental": 20,
    "provolone": 20,
}
CLOVES: dict[str, float] = {"garlic": 5}
# Density, g per ml
LIQUIDS: dict[str, float] = {
    "milk": 1.03,
    "skim milk": 1.03,
    "oat milk": 1.03,
    "soy milk": 1.03,
    "almond milk": 1.02,
    "kefir": 1.03,
    "cream": 1.0,
    "coconut milk": 1.0,
    "olive oil": 0.91,
    "sunflower oil": 0.92,
    "soy sauce": 1.2,
    "balsamic vinegar": 1.1,
    "maple syrup": 1.32,
    "stock": 1.0,
    "orange juice": 1.04,
    "apple juice": 1.04,
    "coffee": 1.0,
    "cappuccino": 1.0,
    "beer": 1.0,
    "wine": 0.99,
    "cola": 1.04,
}
# One level tablespoon in grams, for counting spoons without a scale (a teaspoon is a third).
# Liquids not listed use their density × 15 ml; anything else 15 g (about water).
TBSP_ML = 15
SPOONS: dict[str, float] = {
    "flour": 8, "sugar": 12.5, "salt": 18, "cocoa powder": 7, "cinnamon": 8, "paprika": 7,
    "cumin": 6, "turmeric": 9, "black pepper": 7, "oregano": 3, "thyme": 3, "chili flakes": 5,
    "breadcrumbs": 7, "rolled oats": 5, "granola": 8, "cornflakes": 2, "couscous": 11,
    "chia seeds": 12, "flax seeds": 10, "sesame seeds": 9, "sunflower seeds": 9,
    "pumpkin seeds": 9, "almonds": 9, "walnuts": 7, "hazelnuts": 9, "pine nuts": 9,
    "raisins": 9, "parmesan": 5, "grana padano": 5, "pecorino": 5, "butter": 14,
    "olive oil": 13.5, "sunflower oil": 13.5, "honey": 21, "maple syrup": 20, "jam": 20,
    "nutella": 19, "peanut butter": 16, "tahini": 15, "mayonnaise": 14, "ketchup": 17,
    "mustard": 15, "pesto": 15, "red pesto": 15, "tomato paste": 16, "hummus": 15,
    "greek yogurt": 15, "yogurt": 15, "sour cream": 15, "cream cheese": 15, "mascarpone": 15,
    "ricotta": 15, "quark": 15, "creme fraiche": 15, "curry paste": 15, "capers": 9,
}  # fmt: skip
TABLES: list[tuple[Unit, dict[str, float]]] = [
    ("pc", PIECES), ("slice", SLICES), ("clove", CLOVES), ("ml", LIQUIDS),
]  # fmt: skip


def unit_of(name: str, curated: bool, own: tuple[str | None, float | None] = (None, None)):
    """(unit, grams per unit) for an ingredient; grams when nothing is known. `own` is the
    row's own unit (household products, 0025)."""
    unit, grams = own
    if unit in ("ml", "pc") and grams:
        return unit, grams
    if curated:
        key = name.strip().lower()
        for unit, table in TABLES:
            if key in table:
                return unit, table[key]
    return "g", 1.0


def tbsp_grams(name: str, unit: str, unit_grams: float) -> float:
    """Grams in one level tablespoon of this ingredient (as we count it: `unit`)."""
    if (g := SPOONS.get(name.strip().lower())) is not None:
        return g
    return round(TBSP_ML * unit_grams, 1) if unit == "ml" else float(TBSP_ML)
