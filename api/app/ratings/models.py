from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Numeric, SmallInteger, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Rating(Base):
    """Decision 0003/0008/0009: taste 0.5–5 (half stars), again/effort 5=yes 3=maybe 1=no."""

    __tablename__ = "rating"

    id: Mapped[int] = mapped_column(primary_key=True)
    meal_id: Mapped[int] = mapped_column(ForeignKey("meal.id", ondelete="CASCADE"))
    user_id: Mapped[int] = mapped_column(ForeignKey("app_user.id", ondelete="CASCADE"))
    taste: Mapped[Decimal] = mapped_column(Numeric(2, 1))
    again: Mapped[int] = mapped_column(SmallInteger)
    effort: Mapped[int] = mapped_column(SmallInteger)
    fill: Mapped[str] = mapped_column(String(10), default="right")
    note: Mapped[str | None] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    @property
    def score(self) -> float:
        """One person's score, same as the mock: mean of taste, again and effort."""
        return (float(self.taste) + self.again + self.effort) / 3


def meal_score(ratings: list[Rating]) -> float | None:
    return sum(r.score for r in ratings) / len(ratings) if ratings else None
