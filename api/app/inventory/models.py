from datetime import date

from sqlalchemy import Date, Float, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base, TimestampMixin
from app.nutrition.models import Ingredient


class InventoryItem(Base):
    """What's at home (fridge or pantry, by the ingredient's category)."""

    __tablename__ = "inventory_item"

    id: Mapped[int] = mapped_column(primary_key=True)
    household_id: Mapped[int] = mapped_column(ForeignKey("household.id", ondelete="CASCADE"))
    ingredient_id: Mapped[int] = mapped_column(ForeignKey("ingredient.id", ondelete="RESTRICT"))
    grams: Mapped[float] = mapped_column(Float)
    expires_on: Mapped[date] = mapped_column(Date)

    ingredient: Mapped[Ingredient] = relationship(lazy="joined")


class RanOut(TimestampMixin, Base):
    """Used up while cooking → goes on the shopping list until bought."""

    __tablename__ = "ran_out"

    id: Mapped[int] = mapped_column(primary_key=True)
    household_id: Mapped[int] = mapped_column(ForeignKey("household.id", ondelete="CASCADE"))
    ingredient_id: Mapped[int] = mapped_column(ForeignKey("ingredient.id", ondelete="RESTRICT"))

    ingredient: Mapped[Ingredient] = relationship(lazy="joined")
