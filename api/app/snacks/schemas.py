from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

SnackKind = Literal["sweet", "savory", "fruit", "drink"]  # fruit never counts as a treat (0024)


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


Per = Literal["piece", "100g"]


class SnackIn(BaseModel):
    eaten_on: date
    name: str = Field(min_length=1, max_length=120)
    emoji: str = Field(default="🍪", max_length=8)
    kind: SnackKind
    source: Literal["list", "photo", "label", "saved", "barcode"]
    per: Per
    amount: float = Field(gt=0, le=2000)
    per_unit: NutrientsIn
    analysis_id: int | None = None  # the photo/label this came from; closes it
    save: bool = False  # also keep it in our snacks (with the photo, if any)
    saved_id: int | None = None  # logged from our snacks
    barcode: str | None = Field(default=None, pattern=r"^\d{8,14}$")  # scanned: remembered

    @model_validator(mode="after")
    def barcode_needs_scanned_per_100g(self):
        if self.barcode is not None and (self.source != "barcode" or self.per != "100g"):
            raise ValueError("A barcode comes with a scanned snack per 100 g")
        return self


class SavedSnackOut(BaseModel):
    id: int
    name: str
    emoji: str
    kind: SnackKind
    per: Per
    amount: float
    per_unit: NutrientsIn
    photo_url: str | None
    last_eaten_on: date | None


class SavedSnackPatch(BaseModel):
    """Only the fields sent change."""

    name: str | None = Field(default=None, min_length=1, max_length=120)
    emoji: str | None = Field(default=None, min_length=1, max_length=8)
    kind: SnackKind | None = None
    per: Per | None = None
    amount: float | None = Field(default=None, gt=0, le=2000)
    per_unit: NutrientsIn | None = None
