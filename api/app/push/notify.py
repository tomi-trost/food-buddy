"""The notifications: photo ready, rate after eating, partner rated, "you too?" (a meal the
other one logged), daily reminder."""

from datetime import date, timedelta

import httpx
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.analysis.models import AnalysisJob
from app.auth.models import User
from app.auth.service import household_members
from app.meals.models import CookLog, Meal
from app.push.models import PushSubscription
from app.push.service import PushMessage, push
from app.ratings.models import Rating
from app.suggestions.models import MealSuggestion

RATE_AFTER_MIN = 90  # roughly when the plate is empty
DAILY_LOOKBACK_DAYS = 14  # older unrated meals stop nagging


def _cap(text: str) -> str:
    return text[:1].upper() + text[1:]


async def _not_rated(session: AsyncSession, meal: Meal) -> list[int]:
    rated = set(await session.scalars(select(Rating.user_id).where(Rating.meal_id == meal.id)))
    return [m.id for m in await household_members(session, meal.household_id) if m.id not in rated]


async def notify_ready(session: AsyncSession, client: httpx.AsyncClient, job_id: int) -> int:
    """Both of us: the photo is analyzed (or failed) and waits to be checked."""
    job = await session.get(AnalysisJob, job_id)
    if job is None or job.closed_at is not None or job.status not in ("done", "failed"):
        return 0
    meal = job.kind == "meal"
    url = f"/analysis/{job.id}" if meal else f"/snack/{job.id}"
    if job.status == "failed":
        message = PushMessage(
            title="Couldn't analyze the photo",
            body="Tap to try again.",
            url=url,
            tag=f"job{job.id}",
        )
    else:
        name = (job.result or {}).get("dish" if meal else "name") or (
            "Your meal" if meal else "Your snack"
        )
        message = PushMessage(
            title=f"{_cap(name)} is ready to {'check' if meal else 'log'}",
            body="Tap to review the ingredients and post it." if meal else "Tap to log it.",
            url=url,
            tag=f"job{job.id}",
        )
    members = [m.id for m in await household_members(session, job.household_id)]
    return await push(session, client, members, "ready", message, ref=f"job{job.id}:{job.status}")


async def remind_rate(session: AsyncSession, client: httpx.AsyncClient, meal_id: int) -> int:
    """After eating: whoever hasn't rated the meal yet."""
    meal = await session.get(Meal, meal_id)
    if meal is None:
        return 0
    message = PushMessage(
        title=f"How was the {meal.name}?",
        body="Rate it while you still remember ⭐",
        url=f"/meals/{meal.id}?rate=1",
        tag=f"rate{meal.id}",
    )
    return await push(
        session, client, await _not_rated(session, meal), "rate", message, ref=f"meal{meal.id}"
    )


async def notify_partner_rated(
    session: AsyncSession, client: httpx.AsyncClient, meal_id: int, rater_id: int
) -> int:
    """The other one rated: your turn (only if you haven't rated yet)."""
    meal = await session.get(Meal, meal_id)
    rater = await session.get(User, rater_id)
    rating = await session.scalar(
        select(Rating).where(Rating.meal_id == meal_id, Rating.user_id == rater_id)
    )
    if meal is None or rater is None or rating is None:
        return 0
    message = PushMessage(
        title=f"{rater.name} rated the {meal.name} {float(rating.taste):g} ★",
        body="Your turn: how did you like it?",
        url=f"/meals/{meal.id}?rate=1",
        tag=f"rate{meal.id}",
    )
    others = [uid for uid in await _not_rated(session, meal) if uid != rater_id]
    return await push(
        session, client, others, "partner", message, ref=f"meal{meal.id}:by{rater_id}"
    )


async def notify_suggested(
    session: AsyncSession, client: httpx.AsyncClient, suggestion_id: int
) -> int:
    """The other one logged a meal: did you eat it too? Skipped once answered."""
    suggestion = await session.get(MealSuggestion, suggestion_id)
    if suggestion is None or suggestion.status != "pending":
        return 0
    meal = await session.get(Meal, suggestion.meal_id)
    by = await session.get(User, suggestion.from_user_id)
    message = PushMessage(
        title=f"{by.name} had {meal.name} for {suggestion.meal_type}",
        body="Did you eat it too? Tap to log it.",
        url="/",
        tag=f"shared{suggestion.id}",
    )
    return await push(
        session, client, [suggestion.to_user_id], "shared", message, ref=f"s{suggestion.id}"
    )


def _plural(n: int, word: str) -> str:
    return f"{n} {word}{'' if n == 1 else 's'}"


async def daily_reminder(session: AsyncSession, client: httpx.AsyncClient, today: date) -> int:
    """Evening summary per person, only when something waits for them."""
    users = list(
        await session.scalars(
            select(User).where(User.id.in_(select(PushSubscription.user_id).distinct()))
        )
    )
    since = today - timedelta(days=DAILY_LOOKBACK_DAYS - 1)
    sent = 0
    for user in users:
        recent = select(CookLog.meal_id).where(
            CookLog.cooked_on >= since, CookLog.cooked_on <= today
        )
        mine = select(Rating.meal_id).where(Rating.user_id == user.id)
        to_rate = await session.scalar(
            select(func.count(Meal.id)).where(
                Meal.household_id == user.household_id, Meal.id.in_(recent), Meal.id.not_in(mine)
            )
        )
        to_check = await session.scalar(
            select(func.count(AnalysisJob.id)).where(
                AnalysisJob.household_id == user.household_id,
                AnalysisJob.closed_at.is_(None),
                AnalysisJob.status == "done",
            )
        )
        parts = [_plural(to_rate, "meal") + " to rate"] if to_rate else []
        parts += [_plural(to_check, "photo") + " to check"] if to_check else []
        if not parts:
            continue
        message = PushMessage(title="Waiting for you", body=" · ".join(parts), url="/", tag="daily")
        sent += await push(session, client, [user.id], "daily", message, ref=today.isoformat())
    return sent
