from sqlalchemy import ARRAY, Float, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.nutrition.macros import Nutrients


class Ingredient(Base):
    """Nutrition per 100 g. `aliases` are lowercase alternative names used for matching."""

    __tablename__ = "ingredient"
    __table_args__ = (UniqueConstraint("source", "name"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    aliases: Mapped[list[str]] = mapped_column(ARRAY(Text), default=list)
    source: Mapped[str] = mapped_column(String(20))  # mock | usda | ciqual | off | custom
    kcal: Mapped[float] = mapped_column(Float)
    protein: Mapped[float] = mapped_column(Float)
    carbs: Mapped[float] = mapped_column(Float)
    fat: Mapped[float] = mapped_column(Float)
    fiber: Mapped[float] = mapped_column(Float, default=0)
    sugar: Mapped[float] = mapped_column(Float, default=0)
    emoji: Mapped[str] = mapped_column(String(8), default="")
    category: Mapped[str] = mapped_column(String(20), default="Pantry")  # Meat|Produce|Dairy|Pantry
    price_per_100g: Mapped[float] = mapped_column(Float, default=0)  # EUR; 0 = unknown
    shelf_days: Mapped[int] = mapped_column(Integer, default=7)

    @property
    def location(self) -> str:
        """Where it's stored at home: dry/canned goods in the pantry, the rest in the fridge."""
        return "pantry" if self.category == "Pantry" else "fridge"

    @property
    def per100(self) -> Nutrients:
        return Nutrients(
            kcal=self.kcal,
            protein=self.protein,
            carbs=self.carbs,
            fat=self.fat,
            fiber=self.fiber,
            sugar=self.sugar,
        )
