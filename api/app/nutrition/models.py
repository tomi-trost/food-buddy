from datetime import datetime

from sqlalchemy import (
    ARRAY,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.nutrition.macros import Nutrients


class Ingredient(Base):
    """Nutrition per 100 g. `aliases` are lowercase alternative names used for matching.

    `curated` rows (mock, hand-picked catalog, custom) match fuzzily; the rest of USDA/Ciqual
    only by exact name or alias, and rank below curated rows in search.

    Rows with a `household_id` are that household's products (0025, `source` = h<id>): found
    only by its own ingredient search, never by the model's matching. `unit` / `unit_grams`
    say how they are counted (else the hand-picked tables in `units`).
    """

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
    curated: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    ref: Mapped[str] = mapped_column(String(20), default="", server_default="")  # source row id
    household_id: Mapped[int | None] = mapped_column(ForeignKey("household.id", ondelete="CASCADE"))
    unit: Mapped[str | None] = mapped_column(String(5))  # g | ml | pc
    unit_grams: Mapped[float | None] = mapped_column(Float)

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


class UnmatchedIngredient(Base):
    """A name from the vision model that matched no ingredient (normalized); grows the catalog."""

    __tablename__ = "unmatched_ingredient"

    name: Mapped[str] = mapped_column(String(200), primary_key=True)
    seen: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    last_dish: Mapped[str] = mapped_column(String(200), default="", server_default="")
    first_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
