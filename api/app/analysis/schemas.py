from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class NutrientsOut(BaseModel):
    kcal: float
    protein: float
    carbs: float
    fat: float
    fiber: float
    sugar: float


class MatchedIngredient(BaseModel):
    id: int
    name: str
    per100: NutrientsOut
    score: float


class AnalysisItem(BaseModel):
    name: str  # as the model said it
    grams: float
    confidence: float
    ingredient: MatchedIngredient | None  # None = no match in the nutrition table
    nutrients: NutrientsOut | None


class AnalysisResult(BaseModel):
    dish: str
    meal_type: str
    servings: int
    items: list[AnalysisItem]
    totals: NutrientsOut
    unmatched: int


class AnalysisJobOut(BaseModel):
    id: int
    status: Literal["queued", "running", "done", "failed"]
    photo_url: str
    provider: str | None
    result: AnalysisResult | None
    error: str | None
    created_at: datetime
    finished_at: datetime | None
