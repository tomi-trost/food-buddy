from datetime import date

from sqlalchemy import ARRAY, Boolean, Date, Float, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base, TimestampMixin
from app.nutrition.models import Ingredient

MEAL_TYPES = ("breakfast", "lunch", "dinner")
TYPES = (*MEAL_TYPES, "snack")  # snacks are meals too (0025); the plan only fills MEAL_TYPES


class Meal(TimestampMixin, Base):
    """A household recipe. Ingredient grams are for the whole recipe (`portions` portions).

    A snack is a meal typed `snack` (0025): `snack_kind` for treats, `per` for how it's logged
    (portion | piece of `piece_g` grams | 100g | 100ml). A product (scanned, label) is a snack with
    one household-owned ingredient holding its values (`is_product`).

    Not everything eaten is cooked: `origin` bought (a shop) or out (a restaurant) is logged for
    the nutrition only, with no recipe, stock or rating, and stays out of our meals (`listed`)
    unless we save it there.
    """

    __tablename__ = "meal"

    id: Mapped[int] = mapped_column(primary_key=True)
    household_id: Mapped[int] = mapped_column(ForeignKey("household.id", ondelete="CASCADE"))
    created_by: Mapped[int | None] = mapped_column(ForeignKey("app_user.id", ondelete="SET NULL"))
    name: Mapped[str] = mapped_column(String(120))
    emoji: Mapped[str] = mapped_column(String(8), default="🍽️")
    photo_path: Mapped[str | None] = mapped_column(String(255))
    types: Mapped[list[str]] = mapped_column(ARRAY(String(10)))
    tags: Mapped[list[str]] = mapped_column(ARRAY(String(30)), default=list)
    prep_minutes: Mapped[int]
    portions: Mapped[int]
    cost: Mapped[float | None] = mapped_column(Float)  # manual override; None → from prices
    steps: Mapped[list[str]] = mapped_column(ARRAY(Text), default=list)
    steps_source: Mapped[str] = mapped_column(String(10), default="template")  # template|model|ours
    # Per portion, typed in by us; replaces the values calculated from the ingredients
    nutrients_override: Mapped[dict | None] = mapped_column(JSONB)
    # Set on post: the photo it came from, stock taken out and "ran out" items added, so the
    # post can be undone for UNDO_MINUTES (see meals.undo)
    undo: Mapped[dict | None] = mapped_column(JSONB)
    snack_kind: Mapped[str | None] = mapped_column(String(10))  # sweet|savory|fruit|drink
    per: Mapped[str] = mapped_column(String(8), default="portion", server_default="portion")
    piece_g: Mapped[float | None] = mapped_column(Float)  # per = piece: one piece weighs this
    is_product: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    origin: Mapped[str] = mapped_column(String(6), default="home", server_default="home")
    listed: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    place: Mapped[str | None] = mapped_column(String(80))  # bought/out: shop or restaurant

    ingredients: Mapped[list["MealIngredient"]] = relationship(
        back_populates="meal", cascade="all, delete-orphan", lazy="selectin"
    )


class MealIngredient(Base):
    __tablename__ = "meal_ingredient"

    id: Mapped[int] = mapped_column(primary_key=True)
    meal_id: Mapped[int] = mapped_column(ForeignKey("meal.id", ondelete="CASCADE"))
    ingredient_id: Mapped[int] = mapped_column(ForeignKey("ingredient.id", ondelete="RESTRICT"))
    grams: Mapped[float] = mapped_column(Float)

    meal: Mapped[Meal] = relationship(back_populates="ingredients")
    ingredient: Mapped[Ingredient] = relationship(lazy="joined")


class CookLog(TimestampMixin, Base):
    __tablename__ = "cook_log"

    id: Mapped[int] = mapped_column(primary_key=True)
    meal_id: Mapped[int] = mapped_column(ForeignKey("meal.id", ondelete="CASCADE"))
    user_id: Mapped[int] = mapped_column(ForeignKey("app_user.id", ondelete="CASCADE"))
    cooked_on: Mapped[date] = mapped_column(Date)
