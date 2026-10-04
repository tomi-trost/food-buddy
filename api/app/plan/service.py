from datetime import timedelta

from fastapi import HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User
from app.auth.service import household_members
from app.meals.schemas import MealCard
from app.meals.service import meal_cards
from app.plan.generator import MEAL_TYPES, Candidate, batches, eligible, generate, prep_options
from app.plan.models import PlanApproval, PlanSlot, PlanWeek
from app.plan.schemas import (
    ApprovalOut,
    BatchOut,
    DayOut,
    PlanCreate,
    PlanOut,
    SlotIn,
    SlotOut,
    SummaryOut,
)

DEFAULT_MANUAL_MINUTES = 90  # the mock gives hand-picked cook slots a generous budget


def candidates(cards: list[MealCard]) -> list[Candidate]:
    return [
        Candidate(c.id, tuple(c.types), c.prep_minutes, c.portions, c.score, tuple(c.tags))
        for c in cards
    ]


async def current_plan(session: AsyncSession, household_id: int) -> PlanWeek | None:
    return await session.scalar(
        select(PlanWeek)
        .where(PlanWeek.household_id == household_id)
        .order_by(PlanWeek.id.desc())
        .limit(1)
        .execution_options(populate_existing=True)
    )


async def require_plan(session: AsyncSession, user: User) -> PlanWeek:
    plan = await current_plan(session, user.household_id)
    if plan is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No plan yet")
    return plan


def plan_batches(plan: PlanWeek, cards: dict[int, MealCard]) -> dict[int, int]:
    ids = [s.meal_id for s in plan.slots if s.meal_id in cards]
    return batches(ids, {i: cards[i].portions for i in set(ids)})


async def plan_out(session: AsyncSession, user: User, plan: PlanWeek) -> PlanOut:
    cards = {c.id: c for c in await meal_cards(session, user)}
    slot_at = {(s.day, s.meal_type): s for s in plan.slots}
    days = []
    for d in range(7):
        slots = []
        for mt in MEAL_TYPES:
            s = slot_at[(d, mt)]
            meal = cards.get(s.meal_id) if s.mode in ("cook", "prep") else None
            slots.append(SlotOut(meal_type=mt, mode=s.mode, minutes=s.minutes, meal=meal))
        kcal = sum(s.meal.kcal_per_portion for s in slots if s.meal)
        days.append(DayOut(date=plan.week_start + timedelta(days=d), kcal=round(kcal), slots=slots))

    counts = {m: sum(1 for s in plan.slots if s.mode == m) for m in ("cook", "prep", "out", "skip")}
    times = plan_batches(plan, cards)
    prep_ids = {s.meal_id for s in plan.slots if s.mode == "prep" and s.meal_id in cards}
    approved = {a.user_id for a in plan.approvals}
    members = await household_members(session, user.household_id)
    return PlanOut(
        id=plan.id,
        week_start=plan.week_start,
        status=plan.status,
        wizard=plan.wizard,
        days=days,
        approvals=[
            ApprovalOut(user_id=m.id, name=m.name, color=m.color, approved=m.id in approved)
            for m in members
        ],
        summary=SummaryOut(
            **counts,
            grocery_cost=round(sum(cards[i].cost * n for i, n in times.items()), 2),
            batch_cook=[
                BatchOut(meal_id=i, name=cards[i].name, times=times[i]) for i in sorted(prep_ids)
            ],
        ),
    )


async def create_plan(session: AsyncSession, user: User, body: PlanCreate) -> PlanWeek:
    cards = await meal_cards(session, user)
    wizard = [[c.model_dump() for c in row] for row in body.wizard]
    week = generate(candidates(cards), wizard)
    await session.execute(delete(PlanWeek).where(PlanWeek.household_id == user.household_id))
    plan = PlanWeek(
        household_id=user.household_id,
        week_start=body.week_start,
        status="draft",
        wizard=wizard,
        slots=[
            PlanSlot(day=d, meal_type=mt, mode=s.mode, minutes=s.minutes, meal_id=s.meal_id)
            for d, day in enumerate(week.days)
            for mt, s in day.items()
        ],
        approvals=[],
    )
    session.add(plan)
    await session.commit()
    return plan


def reset_approval(plan: PlanWeek) -> None:
    """Any change to the menu needs both approvals again (mock)."""
    plan.approvals.clear()
    plan.status = "draft"


async def slot_options(session, user, plan: PlanWeek, day: int, meal_type: str) -> list[MealCard]:
    slot = next(s for s in plan.slots if s.day == day and s.meal_type == meal_type)
    cards = await meal_cards(session, user)
    by_id = {c.id: c for c in cards}
    if slot.mode == "prep":
        return [by_id[c.id] for c in prep_options(candidates(cards), meal_type)]
    if slot.mode == "cook":
        minutes = slot.minutes or DEFAULT_MANUAL_MINUTES
        return [by_id[c.id] for c in eligible(candidates(cards), meal_type, minutes)]
    return []


async def set_slot(session, user, plan: PlanWeek, day: int, meal_type: str, body: SlotIn) -> None:
    slot = next(s for s in plan.slots if s.day == day and s.meal_type == meal_type)
    cards = {c.id: c for c in await meal_cards(session, user)}
    if body.meal_id is not None:
        meal = cards.get(body.meal_id)
        if meal is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Meal not found")
        if meal_type not in meal.types:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT, f"{meal.name} isn't a {meal_type} meal"
            )
    slot.mode = body.mode
    if body.mode == "cook":
        slot.minutes = body.minutes or slot.minutes or DEFAULT_MANUAL_MINUTES
        if body.meal_id is None:
            options = eligible(candidates(list(cards.values())), meal_type, slot.minutes)
            slot.meal_id = options[0].id if options else None
        else:
            slot.meal_id = body.meal_id
    elif body.mode == "prep":
        slot.minutes = None
        if body.meal_id is None:
            options = prep_options(candidates(list(cards.values())), meal_type)
            slot.meal_id = options[0].id if options else None
        else:
            slot.meal_id = body.meal_id
    else:
        slot.minutes = slot.meal_id = None
    reset_approval(plan)
    await session.commit()


async def approve(session: AsyncSession, user: User, plan: PlanWeek) -> None:
    if all(a.user_id != user.id for a in plan.approvals):
        plan.approvals.append(PlanApproval(user_id=user.id))
    members = {m.id for m in await household_members(session, user.household_id)}
    if members <= {a.user_id for a in plan.approvals}:
        plan.status = "approved"
    await session.commit()
