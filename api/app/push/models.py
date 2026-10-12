from sqlalchemy import ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base, TimestampMixin


class PushSubscription(TimestampMixin, Base):
    """One device (browser/Home Screen app) that agreed to receive notifications."""

    __tablename__ = "push_subscription"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("app_user.id", ondelete="CASCADE"))
    endpoint: Mapped[str] = mapped_column(Text, unique=True)
    p256dh: Mapped[str] = mapped_column(String(120))
    auth: Mapped[str] = mapped_column(String(60))


class PushSent(TimestampMixin, Base):
    """Remembers one-off notifications (e.g. "rate meal 12") so they are sent only once."""

    __tablename__ = "push_sent"
    __table_args__ = (UniqueConstraint("user_id", "kind", "ref"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("app_user.id", ondelete="CASCADE"))
    kind: Mapped[str] = mapped_column(String(10))
    ref: Mapped[str] = mapped_column(String(40))
