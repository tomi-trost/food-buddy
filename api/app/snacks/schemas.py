from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

SnackKind = Literal["sweet", "savory", "drink"]


class NutrientsIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kcal: float = Field(ge=0, le=5000)
    protein: float = Field(ge=0, le=500)
    carbs: float = Field(ge=0, le=500)
    fat: float = Field(ge=0, le=500)
    fiber: float = Field(ge=0, le=200)
    sugar: float = Field(ge=0, le=500)


class SnackPhotoAnswer(BaseModel):
    """Vision model answer for a snack photo: values for ONE piece/portion."""

    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=80)
    kind: SnackKind
    pieces: float = Field(gt=0, le=50, description="how many pieces are visible")
    per_piece: NutrientsIn


class LabelAnswer(BaseModel):
    """Vision model answer for a nutrition-facts table, exactly as printed.

    Labels print values per 100 g or per serving; `values_per_grams` says which.
    """

    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=80, description="product name if visible")
    kind: SnackKind
    values_per_grams: float = Field(gt=0, le=2000, description="the amount the values refer to")
    values: NutrientsIn


class SnackResult(BaseModel):
    """What the snack screen shows: per unit values + a suggested amount."""

    name: str
    kind: SnackKind
    per: Literal["piece", "100g"]
    amount: float
    per_unit: NutrientsIn


class SnackIn(BaseModel):
    eaten_on: date
    name: str = Field(min_length=1, max_length=120)
    emoji: str = Field(default="🍪", max_length=8)
    kind: SnackKind
    source: Literal["list", "photo", "label"]
    per: Literal["piece", "100g"]
    amount: float = Field(gt=0, le=2000)
    per_unit: NutrientsIn
