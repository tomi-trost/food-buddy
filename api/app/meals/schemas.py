from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.nutrition.schemas import IngredientOut, NutrientsOut

MealType = Literal["breakfast", "lunch", "dinner"]


class ItemIn(BaseModel):
    ingredient_id: int
    grams: float = Field(gt=0, le=5000)


class MealCreate(BaseModel):
    """Post a snapped meal. `items` are grams for ONE plate (what the photo shows)."""

    name: str = Field(min_length=1, max_length=120)
    meal_type: MealType
    eaten_on: date
    prep_minutes: int = Field(ge=1, le=600)
    portions: int = Field(ge=1, le=20, description="portions made; recipe = plate × portions")
    servings_eaten: float = Field(gt=0, le=10)
    cost: float | None = Field(default=None, ge=0, le=1000)
    items: list[ItemIn] = Field(min_length=1, max_length=40)
    used_up: list[int] = Field(default_factory=list)
    analysis_id: int | None = None

    @field_validator("servings_eaten")
    @classmethod
    def half_steps(cls, v: float) -> float:
        if (v * 2) != int(v * 2):
            raise ValueError("servings_eaten must be a multiple of 0.5")
        return v

    @model_validator(mode="after")
    def consistent_ids(self) -> "MealCreate":
        ids = [i.ingredient_id for i in self.items]
        if len(ids) != len(set(ids)):
            raise ValueError("Each ingredient may appear only once")
        if not set(self.used_up) <= set(ids):
            raise ValueError("used_up must only contain ingredients of this meal")
        return self


class MealIngredientOut(BaseModel):
    ingredient: IngredientOut
    grams: float


class MealOut(BaseModel):
    id: int
    name: str
    emoji: str
    photo_url: str | None
    types: list[str]
    tags: list[str]
    prep_minutes: int
    portions: int
    cost: float
    cost_estimated: bool
    steps: list[str]
    steps_source: str
    ingredients: list[MealIngredientOut]
    per_portion: NutrientsOut
    created_at: datetime
