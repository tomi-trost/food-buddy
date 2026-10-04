from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text
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
