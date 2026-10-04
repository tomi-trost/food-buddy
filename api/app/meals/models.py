from datetime import date

from sqlalchemy import ARRAY, Date, Float, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base, TimestampMixin
from app.nutrition.models import Ingredient

MEAL_TYPES = ("breakfast", "lunch", "dinner")


class Meal(TimestampMixin, Base):
    """A household recipe. Ingredient grams are for the whole recipe (`portions` portions)."""

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
    steps_source: Mapped[str] = mapped_column(String(10), default="template")  # template|model

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
