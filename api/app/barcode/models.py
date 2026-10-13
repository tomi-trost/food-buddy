from datetime import datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class OffProduct(Base):
    """Cached Open Food Facts answer for a barcode; `product` is None when OFF doesn't know it."""

    __tablename__ = "off_product"

    code: Mapped[str] = mapped_column(String(14), primary_key=True)
    product: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
