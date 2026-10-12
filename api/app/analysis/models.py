from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, ForeignKey, Numeric, SmallInteger, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base, TimestampMixin


class AnalysisJob(TimestampMixin, Base):
    """One photo sent to the vision model.

    `raw` is the model's answer, `result` the version grounded in the nutrition table.
    """

    __tablename__ = "analysis_job"

    id: Mapped[int] = mapped_column(primary_key=True)
    household_id: Mapped[int] = mapped_column(ForeignKey("household.id", ondelete="CASCADE"))
    user_id: Mapped[int] = mapped_column(ForeignKey("app_user.id", ondelete="CASCADE"))
    photo_path: Mapped[str] = mapped_column(String(255))
    kind: Mapped[str] = mapped_column(String(5), default="meal")  # meal|snack|label
    status: Mapped[str] = mapped_column(String(10), default="queued")  # queued|running|done|failed
    provider: Mapped[str | None] = mapped_column(String(40))
    raw: Mapped[dict | None] = mapped_column(JSONB)
    result: Mapped[dict | None] = mapped_column(JSONB)
    error: Mapped[str | None] = mapped_column(Text)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    meal_id: Mapped[int | None] = mapped_column(ForeignKey("meal.id", ondelete="SET NULL"))
    # Set once the photo is posted as a meal, logged as a snack, or discarded. Until then
    # the household sees it in the "to check" banner.
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Chosen on the Snap screen (meals only): breakfast|lunch|dinner, and "for later" = save
    # the meal to the library without logging it as eaten
    meal_type: Mapped[str | None] = mapped_column(String(10))
    save_only: Mapped[bool] = mapped_column(Boolean, default=False)


class AnalysisRating(Base):
    """A rating given while the photo is still being analyzed; moves onto the meal on post."""

    __tablename__ = "analysis_rating"

    id: Mapped[int] = mapped_column(primary_key=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("analysis_job.id", ondelete="CASCADE"))
    user_id: Mapped[int] = mapped_column(ForeignKey("app_user.id", ondelete="CASCADE"))
    taste: Mapped[Decimal] = mapped_column(Numeric(2, 1))
    again: Mapped[int] = mapped_column(SmallInteger)
    effort: Mapped[int] = mapped_column(SmallInteger)
    fill: Mapped[str] = mapped_column(String(10), default="right")
    note: Mapped[str | None] = mapped_column(Text)
