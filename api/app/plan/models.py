from datetime import date

from sqlalchemy import Date, ForeignKey, SmallInteger, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base, TimestampMixin

MODES = ("cook", "prep", "out", "skip")


class PlanWeek(TimestampMixin, Base):
    """The household's weekly menu (one at a time; re-planning replaces it)."""

    __tablename__ = "plan_week"

    id: Mapped[int] = mapped_column(primary_key=True)
    household_id: Mapped[int] = mapped_column(ForeignKey("household.id", ondelete="CASCADE"))
    week_start: Mapped[date] = mapped_column(Date)  # a Monday
    status: Mapped[str] = mapped_column(String(10), default="draft")  # draft|approved
    wizard: Mapped[list] = mapped_column(JSONB)  # 7 × 3 [{mode, minutes}] the menu was built from

    slots: Mapped[list["PlanSlot"]] = relationship(
        cascade="all, delete-orphan", lazy="selectin", order_by="(PlanSlot.day, PlanSlot.id)"
    )
    approvals: Mapped[list["PlanApproval"]] = relationship(
        cascade="all, delete-orphan", lazy="selectin"
    )


class PlanSlot(Base):
    __tablename__ = "plan_slot"

    id: Mapped[int] = mapped_column(primary_key=True)
    plan_id: Mapped[int] = mapped_column(ForeignKey("plan_week.id", ondelete="CASCADE"))
    day: Mapped[int] = mapped_column(SmallInteger)  # 0 = Monday
    meal_type: Mapped[str] = mapped_column(String(10))
    mode: Mapped[str] = mapped_column(String(5))  # cook|prep|out|skip
    minutes: Mapped[int | None] = mapped_column(SmallInteger)  # cook time budget
    meal_id: Mapped[int | None] = mapped_column(ForeignKey("meal.id", ondelete="SET NULL"))


class PlanApproval(Base):
    __tablename__ = "plan_approval"

    id: Mapped[int] = mapped_column(primary_key=True)
    plan_id: Mapped[int] = mapped_column(ForeignKey("plan_week.id", ondelete="CASCADE"))
    user_id: Mapped[int] = mapped_column(ForeignKey("app_user.id", ondelete="CASCADE"))


class ShoppingCheck(Base):
    """Item ticked off while shopping (in the cart)."""

    __tablename__ = "shopping_check"

    id: Mapped[int] = mapped_column(primary_key=True)
    household_id: Mapped[int] = mapped_column(ForeignKey("household.id", ondelete="CASCADE"))
    ingredient_id: Mapped[int] = mapped_column(ForeignKey("ingredient.id", ondelete="CASCADE"))
