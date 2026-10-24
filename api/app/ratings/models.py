from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Numeric, SmallInteger, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Rating(Base):
    """Decision 0003/0008/0009: taste 0.5–5 (half stars), again 5=yes 3=maybe 1=no.

    Effort and fill are 7-step sliders, −3…+3 (0 = meh / just right); empty for snacks,
    which aren't cooked."""

    __tablename__ = "rating"

    id: Mapped[int] = mapped_column(primary_key=True)
    meal_id: Mapped[int] = mapped_column(ForeignKey("meal.id", ondelete="CASCADE"))
    user_id: Mapped[int] = mapped_column(ForeignKey("app_user.id", ondelete="CASCADE"))
    taste: Mapped[Decimal] = mapped_column(Numeric(2, 1))
    again: Mapped[int] = mapped_column(SmallInteger)
    effort: Mapped[int | None] = mapped_column(SmallInteger)
    fill: Mapped[int | None] = mapped_column(SmallInteger)
    note: Mapped[str | None] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    @property
    def score(self) -> float:
        """One person's score for sorting and the menu: mean of taste, again and effort (the
        slider mapped onto 1–5); a snack has no effort, so taste and again."""
        if self.effort is None:
            return (float(self.taste) + self.again) / 2
        return (float(self.taste) + self.again + 3 + self.effort * 2 / 3) / 3


def meal_score(ratings: list[Rating]) -> float | None:
    return sum(r.score for r in ratings) / len(ratings) if ratings else None


def meal_taste(ratings: list[Rating]) -> float | None:
    """What the stars show: the average taste."""
    return sum(float(r.taste) for r in ratings) / len(ratings) if ratings else None


def is_snack_only(types: list[str] | None) -> bool:
    """Snacks aren't cooked: rated on taste and "have it again" only."""
    return list(types or []) == ["snack"]
