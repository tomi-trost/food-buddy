from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.nutrition.schemas import IngredientOut, NutrientsOut
from app.snacks.schemas import NutrientsIn, SnackKind

MealType = Literal["breakfast", "lunch", "dinner", "snack"]  # snacks are meals too (0025)
MealPer = Literal["portion", "piece", "100g", "100ml"]  # how a snack is logged
Origin = Literal["home", "bought", "out"]  # cooked by us, bought in a shop, eaten out


def _slider():  # 7 steps, −3…+3, 0 = meh / just right
    return Field(default=None, ge=-3, le=3)


def _half_steps(v: float) -> float:
    if (v * 2) != int(v * 2):
        raise ValueError("must be a multiple of 0.5")
    return v


class ItemIn(BaseModel):
    ingredient_id: int
    grams: float = Field(gt=0, le=5000)


class MealCreate(BaseModel):
    """Post a snapped meal. `items` are grams for ONE plate (what the photo shows)."""

    name: str = Field(min_length=1, max_length=120)
    meal_type: MealType
    eaten: bool = True  # False = save for later: library only, no log/stock/reminder
    eaten_on: date | None = None  # required when eaten
    prep_minutes: int = Field(ge=1, le=600)
    portions: int = Field(ge=1, le=20, description="portions made; recipe = plate × portions")
    servings_eaten: float = Field(gt=0, le=10)
    cost: float | None = Field(default=None, ge=0, le=1000)
    items: list[ItemIn] = Field(min_length=1, max_length=40)
    used_up: list[int] = Field(default_factory=list)
    analysis_id: int | None = None
    per_portion: NutrientsIn | None = None  # typed-in values instead of the ingredients' ones
    snack_kind: SnackKind | None = None  # snacks: required
    per: MealPer = "portion"  # snacks: how it's logged from now on
    piece_g: float | None = Field(default=None, gt=0, le=2000)  # per = piece
    # Bought / eaten out: logged for the nutrition only (no recipe, stock or rating), one
    # portion, `cost` = what we paid, and not in our meals until saved there
    origin: Origin = "home"
    place: str | None = Field(default=None, max_length=80)

    _servings = field_validator("servings_eaten")(_half_steps)

    @model_validator(mode="after")
    def not_cooked(self) -> "MealCreate":
        if self.origin != "home" and not self.eaten:
            raise ValueError("Only home-cooked meals can be saved for later")
        if self.origin != "home" and self.used_up:
            raise ValueError("Bought or eaten-out food doesn't use up our ingredients")
        if self.origin == "home" and self.place:
            raise ValueError("A place is for bought or eaten-out food")
        return self

    @model_validator(mode="after")
    def snack_fields(self) -> "MealCreate":
        _check_snack(self.meal_type == "snack", self.snack_kind, self.per, self.piece_g)
        return self

    @model_validator(mode="after")
    def consistent_ids(self) -> "MealCreate":
        ids = [i.ingredient_id for i in self.items]
        if len(ids) != len(set(ids)):
            raise ValueError("Each ingredient may appear only once")
        if not set(self.used_up) <= set(ids):
            raise ValueError("used_up must only contain ingredients of this meal")
        if self.eaten and self.eaten_on is None:
            raise ValueError("eaten_on is required for a meal that was eaten")
        if not self.eaten and self.used_up:
            raise ValueError("A meal saved for later can't use up ingredients")
        return self


class CookIn(BaseModel):
    """ "I ate this meal again": cooked now (recipe leaves stock) or from what's already made
    (leftovers, or my partner cooked and logged it), so stock isn't taken twice.

    A snack is logged by `amount` in the meal's unit (pieces, grams, ml, portions)."""

    meal_type: MealType
    eaten: bool = True  # False = save for later: library only, no log/stock/reminder
    eaten_on: date | None = None  # required when eaten
    servings_eaten: float = Field(default=1, gt=0, le=10)
    amount: float | None = Field(default=None, gt=0, le=5000)  # snacks; default one portion
    cooked: bool = True
    used_up: list[int] = Field(default_factory=list)

    _servings = field_validator("servings_eaten")(_half_steps)

    @model_validator(mode="after")
    def used_up_needs_cooking(self) -> "CookIn":
        if not self.cooked and self.used_up:
            raise ValueError("Only a meal cooked now can use up ingredients")
        if self.amount is not None and self.meal_type != "snack":
            raise ValueError("An amount is for snacks; meals are logged in portions")
        return self


def _check_snack(snack: bool, kind: str | None, per: str, piece_g: float | None) -> None:
    if snack and kind is None:
        raise ValueError("A snack needs its type (sweet, savory, fruit or drink)")
    if not snack and per != "portion":
        raise ValueError("Only snacks are counted in pieces, grams or ml")
    if (per == "piece") != (piece_g is not None):
        raise ValueError("Pieces come with the weight of one piece")


def _unique_ingredients(items: list[ItemIn] | None) -> list[ItemIn] | None:
    if items is not None and len({i.ingredient_id for i in items}) != len(items):
        raise ValueError("Each ingredient may appear only once")
    return items


class MealPatch(BaseModel):
    """Only the fields sent change. `cost: null` = estimate from prices again;
    `per_portion: null` = use the values calculated from the ingredients again."""

    name: str | None = Field(default=None, min_length=1, max_length=120)
    types: list[MealType] | None = Field(default=None, min_length=1)
    prep_friendly: bool | None = None
    prep_minutes: int | None = Field(default=None, ge=1, le=600)
    portions: int | None = Field(default=None, ge=1, le=20)
    cost: float | None = Field(default=None, ge=0, le=1000)
    items: list[ItemIn] | None = Field(
        default=None, min_length=1, max_length=40, description="grams for the whole recipe"
    )
    per_portion: NutrientsIn | None = None
    steps: list[str] | None = Field(default=None, min_length=1, max_length=30)
    snack_kind: SnackKind | None = None
    per: MealPer | None = None  # with piece_g when it's piece
    piece_g: float | None = Field(default=None, gt=0, le=2000)
    product_per100: NutrientsIn | None = None  # products: the values on the pack
    listed: bool | None = None  # bought / eaten out: true = save it to our meals

    _items = field_validator("items")(_unique_ingredients)

    @model_validator(mode="after")
    def piece_weight(self) -> "MealPatch":
        if self.piece_g is not None and self.per not in ("piece", None):
            raise ValueError("A piece weight comes with counting in pieces")
        return self

    @field_validator("steps")
    @classmethod
    def _clean_steps(cls, steps: list[str] | None) -> list[str] | None:
        if steps is None:
            return None
        cleaned = [s.strip() for s in steps if s.strip()]
        if not cleaned:
            raise ValueError("at least one step")
        if any(len(s) > 500 for s in cleaned):
            raise ValueError("a step can have at most 500 characters")
        return cleaned


class RatingIn(BaseModel):
    taste: float = Field(ge=0.5, le=5)
    again: Literal[1, 3, 5]
    effort: int | None = _slider()  # worth the effort: not really … totally; empty for snacks
    fill: int | None = _slider()  # how filling: left us hungry … too heavy; empty for snacks
    note: str | None = Field(default=None, max_length=500)

    _taste = field_validator("taste")(_half_steps)


class RatingOut(BaseModel):
    user_id: int
    name: str
    color: str
    rating: RatingIn | None  # None = not rated yet


class MealIngredientOut(BaseModel):
    ingredient: IngredientOut
    grams: float


class MealStats(BaseModel):
    score: float | None  # sorting and the menu
    taste: float | None  # the stars: average taste
    cooked_count: int
    last_cooked: date | None


class OriginInfo(BaseModel):
    origin: Origin
    listed: bool
    place: str | None


class SnackInfo(BaseModel):
    snack_kind: SnackKind | None
    per: MealPer
    piece_g: float | None
    is_product: bool
    per_unit: NutrientsOut  # values for one portion/piece, or per 100 g / ml (see `per`)
    portion_g: float  # grams one portion weighs (whole recipe ÷ portions)


class MealCard(MealStats, SnackInfo, OriginInfo):
    """Feed item."""

    id: int
    name: str
    emoji: str
    photo_url: str | None
    types: list[str]
    tags: list[str]
    prep_minutes: int
    portions: int
    cost: float
    rated_by_me: bool
    kcal_per_portion: float
    created_at: datetime


class MealOut(MealStats, SnackInfo, OriginInfo):
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
    per_portion: NutrientsOut  # what counts: typed-in values if any, else calculated
    per_portion_calculated: NutrientsOut
    nutrients_overridden: bool
    logged_count: int  # food-log entries (both of us) that deleting the meal can remove
    ratings: list[RatingOut]
    created_at: datetime
    undo_until: datetime | None  # set for whoever posted it, while the post can be undone
