from datetime import date

from sqlalchemy import Date, Float, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base, TimestampMixin
from app.nutrition.macros import Nutrients


class FoodLog(TimestampMixin, Base):
    """Everything a person ate (meals and snacks). Daily totals and insights read from here."""

    __tablename__ = "food_log"

    id: Mapped[int] = mapped_column(primary_key=True)
    household_id: Mapped[int] = mapped_column(ForeignKey("household.id", ondelete="CASCADE"))
    user_id: Mapped[int] = mapped_column(ForeignKey("app_user.id", ondelete="CASCADE"))
    eaten_on: Mapped[date] = mapped_column(Date)
    meal_type: Mapped[str] = mapped_column(String(10))  # breakfast|lunch|dinner|snack
    name: Mapped[str] = mapped_column(String(120))
    emoji: Mapped[str] = mapped_column(String(8), default="")
    meal_id: Mapped[int | None] = mapped_column(ForeignKey("meal.id", ondelete="SET NULL"))
    kind: Mapped[str] = mapped_column(String(10), default="meal")  # meal|snack
    snack_kind: Mapped[str | None] = mapped_column(String(10))  # sweet|savory|drink
    is_reward: Mapped[bool] = mapped_column(default=False)
    source: Mapped[str] = mapped_column(String(10))  # snap|cook|list|photo|label|reward
    kcal: Mapped[float] = mapped_column(Float, default=0)
    protein: Mapped[float] = mapped_column(Float, default=0)
    carbs: Mapped[float] = mapped_column(Float, default=0)
    fat: Mapped[float] = mapped_column(Float, default=0)
    fiber: Mapped[float] = mapped_column(Float, default=0)
    sugar: Mapped[float] = mapped_column(Float, default=0)

    def set_nutrients(self, n: Nutrients) -> None:
        for key, value in n.rounded().items():
            setattr(self, key, value)

    @property
    def nutrients(self) -> Nutrients:
        return Nutrients(
            kcal=self.kcal,
            protein=self.protein,
            carbs=self.carbs,
            fat=self.fat,
            fiber=self.fiber,
            sugar=self.sugar,
        )
