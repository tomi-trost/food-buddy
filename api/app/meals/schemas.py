from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.nutrition.schemas import IngredientOut, NutrientsOut
from app.snacks.schemas import NutrientsIn

MealType = Literal["breakfast", "lunch", "dinner"]
Fill = Literal["hungry", "right", "heavy"]


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

    _servings = field_validator("servings_eaten")(_half_steps)

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
    (leftovers, or my partner cooked and logged it), so stock isn't taken twice."""

    meal_type: MealType
    eaten: bool = True  # False = save for later: library only, no log/stock/reminder
    eaten_on: date | None = None  # required when eaten
    servings_eaten: float = Field(default=1, gt=0, le=10)
    cooked: bool = True
    used_up: list[int] = Field(default_factory=list)

    _servings = field_validator("servings_eaten")(_half_steps)

    @model_validator(mode="after")
    def used_up_needs_cooking(self) -> "CookIn":
        if not self.cooked and self.used_up:
            raise ValueError("Only a meal cooked now can use up ingredients")
        return self


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

    _items = field_validator("items")(_unique_ingredients)


class RatingIn(BaseModel):
    taste: float = Field(ge=0.5, le=5)
    again: Literal[1, 3, 5]
    effort: Literal[1, 3, 5]
    fill: Fill = "right"
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
    score: float | None
    cooked_count: int
    last_cooked: date | None


class MealCard(MealStats):
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


class MealOut(MealStats):
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
