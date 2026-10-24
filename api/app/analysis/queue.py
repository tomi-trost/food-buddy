"""Photos waiting to be checked: open until posted as a meal, logged as a snack, or discarded.

Both people in a household see every open job; whoever confirms first wins (the row is
locked while posting, the other gets 409 and finds the meal through `meal_id`).
"""

from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.analysis.models import AnalysisJob, AnalysisRating
from app.auth.models import User
from app.ratings.models import Rating


async def lock_job(session: AsyncSession, user: User, job_id: int) -> AnalysisJob:
    job = await session.scalar(
        select(AnalysisJob)
        .where(AnalysisJob.id == job_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if job is None or job.household_id != user.household_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Analysis not found")
    return job


async def lock_open_job(session: AsyncSession, user: User, job_id: int) -> AnalysisJob:
    job = await lock_job(session, user, job_id)
    if job.closed_at is not None:
        detail = (
            "This photo was already posted"
            if job.meal_id
            else "This photo was already logged or discarded"
        )
        raise HTTPException(status.HTTP_409_CONFLICT, detail)
    return job


def close(job: AnalysisJob, meal_id: int | None = None) -> None:
    job.closed_at = datetime.now(UTC)
    job.meal_id = meal_id


async def move_early_ratings(
    session: AsyncSession, job: AnalysisJob, meal_id: int, *, snack: bool = False
) -> None:
    early = await session.scalars(select(AnalysisRating).where(AnalysisRating.job_id == job.id))
    for r in early:
        session.add(
            Rating(
                meal_id=meal_id,
                user_id=r.user_id,
                taste=r.taste,
                again=r.again,
                effort=None if snack else (r.effort or 0),  # rated as a meal, posted as a snack
                fill=None if snack else (r.fill or 0),
                note=r.note,
            )
        )
    await drop_early_ratings(session, job)


async def drop_early_ratings(session: AsyncSession, job: AnalysisJob) -> None:
    await session.execute(delete(AnalysisRating).where(AnalysisRating.job_id == job.id))
