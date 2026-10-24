from typing import Annotated, Literal

from fastapi import APIRouter, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field, StringConstraints
from sqlalchemy import select

from app.analysis.models import AnalysisJob, AnalysisRating
from app.analysis.photos import InvalidPhoto, normalize_photo, save_photo
from app.analysis.queue import close, lock_job, lock_open_job
from app.analysis.schemas import AnalysisJobOut, JobBy
from app.analysis.tasks import queue_analysis
from app.auth.deps import CurrentUser, Session
from app.auth.models import User
from app.config import get_settings
from app.meals.aliases import household_aliases, suggestions
from app.meals.schemas import RatingIn
from app.meals.service import apply_rating

router = APIRouter(prefix="/analyses", tags=["analysis"])


async def jobs_out(session: Session, user: User, jobs: list[AnalysisJob]) -> list[AnalysisJobOut]:
    ids = [j.id for j in jobs]
    names = {
        u.id: u.name
        for u in await session.scalars(select(User).where(User.id.in_({j.user_id for j in jobs})))
    }
    mine = {
        r.job_id: r
        for r in await session.scalars(
            select(AnalysisRating).where(
                AnalysisRating.job_id.in_(ids), AnalysisRating.user_id == user.id
            )
        )
    }
    to_check = [j for j in jobs if j.kind == "meal" and j.status == "done" and not j.closed_at]
    aliases = await household_aliases(session, user.household_id) if to_check else {}
    out = []
    for job in jobs:
        meal = job.kind == "meal"
        rating = mine.get(job.id)
        out.append(
            AnalysisJobOut(
                id=job.id,
                by=JobBy(id=job.user_id, name=names.get(job.user_id, "")),
                kind=job.kind,
                status=job.status,
                photo_url=f"/api/analyses/{job.id}/photo" if job.photo_path else None,
                description=job.description,
                provider=job.provider,
                result=job.result if meal else None,
                snack=None if meal else job.result,
                error=job.error,
                created_at=job.created_at,
                finished_at=job.finished_at,
                closed=job.closed_at is not None,
                meal_type=job.meal_type,
                save_only=job.save_only,
                meal_id=job.meal_id,
                my_rating=RatingIn(
                    taste=float(rating.taste),
                    again=rating.again,
                    effort=rating.effort,
                    fill=rating.fill,
                    note=rating.note,
                )
                if rating
                else None,
                dishes=suggestions(job.result, aliases) if job in to_check else [],
            )
        )
    return out


async def job_out(session: Session, user: User, job: AnalysisJob) -> AnalysisJobOut:
    return (await jobs_out(session, user, [job]))[0]


async def get_own_job(session: Session, user: CurrentUser, job_id: int) -> AnalysisJob:
    job = await session.get(AnalysisJob, job_id)
    if job is None or job.household_id != user.household_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Analysis not found")
    return job


@router.post("", status_code=status.HTTP_202_ACCEPTED)
async def create_analysis(
    photo: UploadFile,
    user: CurrentUser,
    session: Session,
    kind: Literal["meal", "snack", "label"] = Form(default="meal"),
    meal_type: Literal["breakfast", "lunch", "dinner", "snack"] | None = Form(default=None),
    save_only: bool = Form(default=False),
) -> AnalysisJobOut:
    settings = get_settings()
    max_bytes = settings.max_upload_mb * 1024 * 1024
    data = await photo.read(max_bytes + 1)
    if len(data) > max_bytes:
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, "Photo too large")
    try:
        jpeg = normalize_photo(data, settings.photo_max_px)
    except InvalidPhoto as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc

    job = AnalysisJob(
        household_id=user.household_id,
        user_id=user.id,
        photo_path=save_photo(settings.photo_dir, user.household_id, jpeg),
        kind=kind,
        meal_type=meal_type if kind == "meal" else None,
        save_only=save_only and kind == "meal",
    )
    session.add(job)
    await session.commit()
    await session.refresh(job)
    await queue_analysis(job.id)
    return await job_out(session, user, job)


class TextIn(BaseModel):
    kind: Literal["meal", "snack"] = "meal"  # a label has to be photographed
    text: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
    meal_type: Literal["breakfast", "lunch", "dinner", "snack"] | None = None
    save_only: bool = Field(default=False)


@router.post("/text", status_code=status.HTTP_202_ACCEPTED)
async def create_text_analysis(body: TextIn, user: CurrentUser, session: Session) -> AnalysisJobOut:
    """Type a dish ("spaghetti carbonara", "2 slices of tiramisu"): the model estimates it
    from the name, then it's checked and posted like a photo."""
    meal = body.kind == "meal"
    job = AnalysisJob(
        household_id=user.household_id,
        user_id=user.id,
        photo_path=None,
        description=body.text,
        kind=body.kind,
        meal_type=body.meal_type if meal else None,
        save_only=body.save_only and meal,
    )
    session.add(job)
    await session.commit()
    await session.refresh(job)
    await queue_analysis(job.id)
    return await job_out(session, user, job)


@router.get("/open")
async def open_analyses(user: CurrentUser, session: Session) -> list[AnalysisJobOut]:
    """The household's photos still to check (running, ready or failed), oldest first."""
    jobs = await session.scalars(
        select(AnalysisJob)
        .where(AnalysisJob.household_id == user.household_id, AnalysisJob.closed_at.is_(None))
        .order_by(AnalysisJob.created_at, AnalysisJob.id)
    )
    return await jobs_out(session, user, list(jobs))


@router.get("/{job_id}")
async def get_analysis(job_id: int, user: CurrentUser, session: Session) -> AnalysisJobOut:
    return await job_out(session, user, await get_own_job(session, user, job_id))


@router.put("/{job_id}/rating")
async def rate_early(
    job_id: int, body: RatingIn, user: CurrentUser, session: Session
) -> AnalysisJobOut:
    """Rate while the model is still working; the rating moves onto the meal when posted."""
    job = await lock_open_job(session, user, job_id)
    if job.kind != "meal":
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Only meals are rated")
    rating = await session.scalar(
        select(AnalysisRating).where(
            AnalysisRating.job_id == job.id, AnalysisRating.user_id == user.id
        )
    )
    if rating is None:
        rating = AnalysisRating(job_id=job.id, user_id=user.id)
        session.add(rating)
    apply_rating(rating, body, snack=job.meal_type == "snack")
    await session.commit()
    return await job_out(session, user, job)


@router.post("/{job_id}/discard")
async def discard_analysis(job_id: int, user: CurrentUser, session: Session) -> AnalysisJobOut:
    job = await lock_job(session, user, job_id)
    if job.meal_id is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "This photo was already posted")
    if job.closed_at is None:
        close(job)
        job.discarded = True  # early ratings stay, so Undo brings them back too
        await session.commit()
    return await job_out(session, user, job)


@router.post("/{job_id}/reopen")
async def reopen_analysis(job_id: int, user: CurrentUser, session: Session) -> AnalysisJobOut:
    """Undo a discard: the photo is back in the banner, as it was."""
    job = await lock_job(session, user, job_id)
    if not job.discarded:
        raise HTTPException(status.HTTP_409_CONFLICT, "Only a discarded photo can be brought back")
    job.closed_at, job.discarded = None, False
    await session.commit()
    if job.status == "queued":  # the worker skips discarded jobs: queue it again
        await queue_analysis(job.id)
    return await job_out(session, user, job)


@router.post("/{job_id}/retry", status_code=status.HTTP_202_ACCEPTED)
async def retry_analysis(job_id: int, user: CurrentUser, session: Session) -> AnalysisJobOut:
    job = await lock_open_job(session, user, job_id)
    if job.status != "failed":
        raise HTTPException(status.HTTP_409_CONFLICT, "Only a failed analysis can be retried")
    job.status, job.error, job.finished_at = "queued", None, None
    job.raw = job.result = None
    await session.commit()
    await queue_analysis(job.id)
    return await job_out(session, user, job)


@router.get("/{job_id}/photo", response_class=FileResponse)
async def get_analysis_photo(job_id: int, user: CurrentUser, session: Session) -> FileResponse:
    job = await get_own_job(session, user, job_id)
    if not job.photo_path:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "This was typed, not photographed")
    return FileResponse(get_settings().photo_dir / job.photo_path, media_type="image/jpeg")
