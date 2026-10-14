from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class OffProduct(Base):
    """Cached Open Food Facts answer for a barcode; `product` is None when OFF doesn't know it."""

    __tablename__ = "off_product"

    code: Mapped[str] = mapped_column(String(14), primary_key=True)
    product: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class HouseholdProduct(Base):
    """A scanned product as we last logged it (name, type, values we corrected, usual amount).

    The next scan of the same barcode uses this instead of Open Food Facts; also for products OFF
    doesn't know, typed in once.
    """

    __tablename__ = "household_product"
    __table_args__ = (UniqueConstraint("household_id", "code"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    household_id: Mapped[int] = mapped_column(ForeignKey("household.id", ondelete="CASCADE"))
    code: Mapped[str] = mapped_column(String(14))
    name: Mapped[str] = mapped_column(String(120))
    kind: Mapped[str] = mapped_column(String(10))  # sweet|savory|fruit|drink
    per100: Mapped[dict] = mapped_column(JSONB)
    per: Mapped[str] = mapped_column(String(5), default="100g", server_default="100g")  # | 100ml
    amount: Mapped[float] = mapped_column(Float)  # grams (ml when per 100 ml) we usually eat
    piece_g: Mapped[float | None] = mapped_column(Float)  # set when we count it in pieces
    updated_by: Mapped[int | None] = mapped_column(ForeignKey("app_user.id", ondelete="SET NULL"))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
