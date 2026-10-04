from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class DetectedIngredient(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=80, description="Generic English name")
    grams: float = Field(ge=0, le=5000, description="Estimated weight on the plate")
    confidence: float = Field(ge=0, le=1)


class MealAnalysis(BaseModel):
    """What the vision model must return (also sent to it as the JSON schema)."""

    model_config = ConfigDict(extra="forbid")

    dish: str = Field(min_length=1, max_length=120)
    meal_type: Literal["breakfast", "lunch", "dinner", "snack"]
    servings: int = Field(ge=1, le=12)
    ingredients: list[DetectedIngredient] = Field(max_length=25)
