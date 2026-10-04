from typing import Literal

from fastapi import APIRouter, Path, status

from app.auth.deps import CurrentUser, Session
from app.meals.schemas import MealCard
from app.plan.schemas import PlanCreate, PlanOut, SlotIn
from app.plan.service import (
    approve,
    create_plan,
    current_plan,
    plan_out,
    require_plan,
    set_slot,
    slot_options,
)

router = APIRouter(prefix="/plan", tags=["plan"])

Day = Path(ge=0, le=6)
MealTypePath = Literal["breakfast", "lunch", "dinner"]


@router.get("")
async def get_plan(user: CurrentUser, session: Session) -> PlanOut | None:
    plan = await current_plan(session, user.household_id)
    return await plan_out(session, user, plan) if plan else None


@router.post("", status_code=status.HTTP_201_CREATED)
async def make_plan(body: PlanCreate, user: CurrentUser, session: Session) -> PlanOut:
    """Generate a new menu from the wizard; replaces the current one."""
    plan = await create_plan(session, user, body)
    return await plan_out(session, user, plan)


@router.get("/slots/{day}/{meal_type}/options")
async def get_slot_options(
    meal_type: MealTypePath, user: CurrentUser, session: Session, day: int = Day
) -> list[MealCard]:
    plan = await require_plan(session, user)
    return await slot_options(session, user, plan, day, meal_type)


@router.put("/slots/{day}/{meal_type}")
async def put_slot(
    meal_type: MealTypePath, body: SlotIn, user: CurrentUser, session: Session, day: int = Day
) -> PlanOut:
    plan = await require_plan(session, user)
    await set_slot(session, user, plan, day, meal_type, body)
    return await plan_out(session, user, await require_plan(session, user))


@router.post("/approve")
async def approve_plan(user: CurrentUser, session: Session) -> PlanOut:
    plan = await require_plan(session, user)
    await approve(session, user, plan)
    return await plan_out(session, user, await require_plan(session, user))
