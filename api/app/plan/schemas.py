from datetime import date
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.meals.schemas import MealCard

Mode = Literal["cook", "prep", "out", "skip"]
MealType = Literal["breakfast", "lunch", "dinner"]


class WizardCell(BaseModel):
    mode: Mode
    minutes: int | None = Field(default=None, ge=5, le=240)

    @model_validator(mode="after")
    def cook_needs_minutes(self) -> "WizardCell":
        if self.mode == "cook" and self.minutes is None:
            raise ValueError("cook slots need minutes")
        if self.mode != "cook":
            self.minutes = None
        return self


class PlanCreate(BaseModel):
    week_start: date
    wizard: list[list[WizardCell]] = Field(min_length=7, max_length=7)

    @field_validator("week_start")
    @classmethod
    def monday(cls, v: date) -> date:
        if v.weekday() != 0:
            raise ValueError("week_start must be a Monday")
        return v

    @field_validator("wizard")
    @classmethod
    def three_per_day(cls, v: list[list[WizardCell]]) -> list[list[WizardCell]]:
        if any(len(row) != 3 for row in v):
            raise ValueError("each day needs breakfast, lunch and dinner")
        return v


class SlotIn(BaseModel):
    mode: Mode
    minutes: int | None = Field(default=None, ge=5, le=240)
    meal_id: int | None = None


class SlotOut(BaseModel):
    meal_type: MealType
    mode: Mode
    minutes: int | None
    meal: MealCard | None


class DayOut(BaseModel):
    date: date
    kcal: float  # one portion of each planned meal
    slots: list[SlotOut]


class ApprovalOut(BaseModel):
    user_id: int
    name: str
    color: str
    approved: bool


class BatchOut(BaseModel):
    meal_id: int
    name: str
    times: int


class SummaryOut(BaseModel):
    cook: int
    prep: int
    out: int
    skip: int
    grocery_cost: float
    batch_cook: list[BatchOut]  # prep meals and how often to cook them


class PlanOut(BaseModel):
    id: int
    week_start: date
    status: Literal["draft", "approved"]
    wizard: list[list[WizardCell]]
    days: list[DayOut]
    approvals: list[ApprovalOut]
    summary: SummaryOut
