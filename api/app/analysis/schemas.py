from datetime import datetime
from typing import Literal

from pydantic import BaseModel

from app.meals.schemas import RatingIn
from app.nutrition.schemas import IngredientOut, NutrientsOut
from app.snacks.schemas import SnackResult


class MatchedIngredient(IngredientOut):
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


class JobBy(BaseModel):
    id: int
    name: str


class AnalysisJobOut(BaseModel):
    id: int
    by: JobBy  # who took the photo
    kind: Literal["meal", "snack", "label"]
    status: Literal["queued", "running", "done", "failed"]
    photo_url: str | None  # None: typed, not snapped
    description: str | None
    provider: str | None
    result: AnalysisResult | None  # meals
    snack: SnackResult | None  # snack photos and labels
    error: str | None
    created_at: datetime
    finished_at: datetime | None
    closed: bool  # posted, logged or discarded: no longer "to check"
    meal_type: Literal["breakfast", "lunch", "dinner", "snack"] | None  # chosen when snapping
    save_only: bool  # "for later": save to the library, don't log as eaten
    meal_id: int | None  # set once posted
    my_rating: RatingIn | None  # rating given before posting (meals only)
