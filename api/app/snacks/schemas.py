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
    """Vision model answer for a snack photo or description: counted things (cookies, fruit,
    bars) in pieces with values for ONE piece; spooned or poured ones (pudding, yogurt, nuts)
    in grams and drinks in ml, with values per 100 g / 100 ml."""

    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=80)
    kind: SnackKind
    unit: Literal["piece", "g", "ml"]
    amount: float = Field(gt=0, le=2000, description="how many pieces, or grams / ml")
    values: NutrientsIn = Field(description="for ONE piece, or per 100 g / 100 ml")


class LabelAnswer(BaseModel):
    """Vision model answer for a nutrition-facts table, exactly as printed.

    Labels print values per 100 g or per serving; `values_per_grams` says which.
    """

    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=80, description="product name if visible")
    kind: SnackKind
    values_per_grams: float = Field(gt=0, le=2000, description="the amount the values refer to")
    values_unit: Literal["g", "ml"] = Field(description="ml when printed per 100 ml / ml serving")
    values: NutrientsIn


Per = Literal["piece", "100g", "100ml"]  # values per piece (amount = pieces), or per 100 g / ml


class SnackResult(BaseModel):
    """What the snack screen shows: per unit values + a suggested amount."""

    name: str
    kind: SnackKind
    per: Per
    amount: float
    per_unit: NutrientsIn


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
    piece_g: float | None = Field(default=None, gt=0, le=1000)  # scanned and counted in pieces
    piece_base: Literal["100g", "100ml"] = "100g"  # counted: what a piece's weight is in

    @model_validator(mode="after")
    def barcode_needs_scanned_values(self):
        if self.barcode is None:
            if self.piece_g is not None:
                raise ValueError("piece_g only comes with a scanned product")
            return self
        if self.source != "barcode":
            raise ValueError("A barcode comes with a scanned snack")
        if (self.per == "piece") != (self.piece_g is not None):
            raise ValueError("A scanned snack is per 100 g, or per piece with the piece weight")
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
