from pydantic import BaseModel

from app.nutrition.models import Ingredient
from app.nutrition.units import Unit, unit_of


class NutrientsOut(BaseModel):
    kcal: float
    protein: float
    carbs: float
    fat: float
    fiber: float
    sugar: float


class IngredientOut(BaseModel):
    id: int
    name: str
    emoji: str
    category: str
    location: str
    price_per_100g: float
    per100: NutrientsOut
    unit: Unit  # how amounts are shown/typed; still stored in grams
    unit_grams: float  # grams per piece/slice/clove, g per ml, or 1

    @classmethod
    def of(cls, ing: Ingredient) -> "IngredientOut":
        unit, unit_grams = unit_of(ing.name, ing.curated)
        return cls(
            id=ing.id,
            name=ing.name,
            emoji=ing.emoji,
            category=ing.category,
            location=ing.location,
            price_per_100g=ing.price_per_100g,
            per100=NutrientsOut(**ing.per100.rounded()),
            unit=unit,
            unit_grams=unit_grams,
        )
