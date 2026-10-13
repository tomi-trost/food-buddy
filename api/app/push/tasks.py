"""Push jobs run on their own `push` queue/worker so they never wait behind a 3-minute analysis."""

from datetime import UTC, datetime
from typing import Literal

from app.db import SessionLocal
from app.jobs import jobs_app
from app.push import notify
from app.push.service import push_client


async def _run(call, *args) -> None:
    async with push_client() as client, SessionLocal() as session:
        await call(session, client, *args)


@jobs_app.task(name="notify_ready", queue="push")
async def notify_ready(job_id: int) -> None:
    await _run(notify.notify_ready, job_id)


@jobs_app.task(name="remind_rate", queue="push")
async def remind_rate(meal_id: int) -> None:
    await _run(notify.remind_rate, meal_id)


@jobs_app.task(name="notify_partner_rated", queue="push")
async def notify_partner_rated(meal_id: int, rater_id: int) -> None:
    await _run(notify.notify_partner_rated, meal_id, rater_id)


@jobs_app.task(name="notify_suggested", queue="push")
async def notify_suggested(suggestion_id: int) -> None:
    await _run(notify.notify_suggested, suggestion_id)


@jobs_app.task(name="notify_plan", queue="push")
async def notify_plan(plan_id: int, by_id: int, event: Literal["new", "approved"]) -> None:
    await _run(notify.notify_plan, plan_id, by_id, event)


# 18:00 UTC = 20:00 in summer, 19:00 in winter (Central Europe)
@jobs_app.periodic(cron="0 18 * * *")
@jobs_app.task(name="daily_reminder", queue="push")
async def daily_reminder(timestamp: int) -> None:
    await _run(notify.daily_reminder, datetime.fromtimestamp(timestamp, UTC).date())
