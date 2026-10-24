import logging
from datetime import UTC, datetime

import httpx
from procrastinate.exceptions import AlreadyEnqueued
from sqlalchemy import update

from app.analysis.models import AnalysisJob
from app.analysis.service import run_analysis
from app.config import get_settings
from app.db import SessionLocal
from app.jobs import jobs_app
from app.push.tasks import notify_ready
from app.vision.providers import chain_from_settings

log = logging.getLogger(__name__)


async def queue_analysis(job_id: int) -> None:
    """Queue the model run once: a second request while it's still waiting is a no-op."""
    try:
        await analyze_photo.configure(queueing_lock=f"analysis-{job_id}").defer_async(job_id=job_id)
    except AlreadyEnqueued:
        pass


@jobs_app.task(name="analyze_photo", queue="vision")
async def analyze_photo(job_id: int) -> None:
    settings = get_settings()
    try:
        async with httpx.AsyncClient() as client, SessionLocal() as session:
            chain = chain_from_settings(settings, client)
            job = await run_analysis(
                session, job_id, chain, settings.photo_dir, vision_max_px=settings.vision_max_px
            )
    except Exception:
        # Never leave the job "queued"/"running" forever: the app would keep polling.
        log.exception("analyze_photo failed for job %s", job_id)
        async with SessionLocal() as session:
            await session.execute(
                update(AnalysisJob)
                .where(AnalysisJob.id == job_id, AnalysisJob.status.in_(["queued", "running"]))
                .values(
                    status="failed",
                    error="Unexpected error while analyzing the photo",
                    finished_at=datetime.now(UTC),
                )
            )
            await session.commit()
        raise
    if job.status in ("done", "failed"):
        await notify_ready.defer_async(job_id=job_id)
