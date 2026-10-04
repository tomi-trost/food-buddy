from pydantic import BaseModel

from app.nutrition.models import Ingredient


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

    @classmethod
    def of(cls, ing: Ingredient) -> "IngredientOut":
        return cls(
            id=ing.id,
            name=ing.name,
            emoji=ing.emoji,
            category=ing.category,
            location=ing.location,
            price_per_100g=ing.price_per_100g,
            per100=NutrientsOut(**ing.per100.rounded()),
        )
