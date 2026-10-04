from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base, TimestampMixin


class Household(TimestampMixin, Base):
    __tablename__ = "household"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    invite_code: Mapped[str] = mapped_column(String(32), unique=True)
    reward_per: Mapped[int] = mapped_column(default=2)  # treat-free days per croissant
    reward_cap: Mapped[int] = mapped_column(default=3)  # max croissants per week

    members: Mapped[list["User"]] = relationship(back_populates="household", lazy="raise")


class User(TimestampMixin, Base):
    __tablename__ = "app_user"

    id: Mapped[int] = mapped_column(primary_key=True)
    household_id: Mapped[int] = mapped_column(ForeignKey("household.id", ondelete="CASCADE"))
    email: Mapped[str] = mapped_column(String(254), unique=True)
    name: Mapped[str] = mapped_column(String(80))
    password_hash: Mapped[str] = mapped_column(String(255))
    color: Mapped[str] = mapped_column(String(9), default="#b9532f")
    goal_kcal: Mapped[int] = mapped_column(default=2200)
    goal_protein: Mapped[int] = mapped_column(default=110)
    goal_fiber: Mapped[int] = mapped_column(default=30)
    goal_sugar: Mapped[int] = mapped_column(default=50)

    household: Mapped[Household] = relationship(back_populates="members", lazy="joined")
