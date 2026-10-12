from datetime import date

from sqlalchemy import Date, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base, TimestampMixin


class MealSuggestion(TimestampMixin, Base):
    """ "Tomi had the curry for lunch, you too?": made when one of us logs a meal."""

    __tablename__ = "meal_suggestion"
    __table_args__ = (UniqueConstraint("to_user_id", "meal_id", "eaten_on", "meal_type"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    household_id: Mapped[int] = mapped_column(ForeignKey("household.id", ondelete="CASCADE"))
    from_user_id: Mapped[int] = mapped_column(ForeignKey("app_user.id", ondelete="CASCADE"))
    to_user_id: Mapped[int] = mapped_column(ForeignKey("app_user.id", ondelete="CASCADE"))
    meal_id: Mapped[int] = mapped_column(ForeignKey("meal.id", ondelete="CASCADE"))
    meal_type: Mapped[str] = mapped_column(String(10))  # breakfast|lunch|dinner
    eaten_on: Mapped[date] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(10), default="pending")  # pending|accepted|declined
