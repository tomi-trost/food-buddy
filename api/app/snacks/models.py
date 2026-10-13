from datetime import date

from sqlalchemy import Date, Float, ForeignKey, Index, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base, TimestampMixin


class SavedSnack(TimestampMixin, Base):
    """A snack the household logs again (home-made tiramisu, a favourite bar), shared by both.

    One per name (case-insensitive): saving the same name again updates it.
    """

    __tablename__ = "saved_snack"
    __table_args__ = (Index("saved_snack_name", "household_id", func.lower("name"), unique=True),)

    id: Mapped[int] = mapped_column(primary_key=True)
    household_id: Mapped[int] = mapped_column(ForeignKey("household.id", ondelete="CASCADE"))
    created_by: Mapped[int | None] = mapped_column(ForeignKey("app_user.id", ondelete="SET NULL"))
    name: Mapped[str] = mapped_column(String(120))
    emoji: Mapped[str] = mapped_column(String(8))
    kind: Mapped[str] = mapped_column(String(10))  # sweet|savory|fruit|drink
    per: Mapped[str] = mapped_column(String(5))  # piece | 100g
    amount: Mapped[float] = mapped_column(Float)  # usual amount: pieces or grams
    per_unit: Mapped[dict] = mapped_column(JSONB)  # values per piece / per 100 g
    photo_path: Mapped[str | None] = mapped_column(String(255))
    last_eaten_on: Mapped[date | None] = mapped_column(Date)
