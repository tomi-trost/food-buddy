"""Queue upkeep: jobs left "doing" by a worker that died (a deploy restarts the worker in the
middle of a 3-minute photo analysis) would wait forever; put them back in the queue."""

import logging

from procrastinate import App

from app.jobs import jobs_app

log = logging.getLogger(__name__)

STALLED_AFTER_S = 60  # workers report every 10 s; a minute of silence means it's gone


async def recover_stalled(app: App) -> list[int]:
    """Retry jobs whose worker stopped reporting; returns their ids."""
    stalled = list(await app.job_manager.get_stalled_jobs(seconds_since_heartbeat=STALLED_AFTER_S))
    for job in stalled:
        log.warning("retrying stalled job %s (%s %s)", job.id, job.task_name, job.task_kwargs)
        await app.job_manager.retry_job(job)
    return [job.id for job in stalled]


# On the push worker: it keeps running while the vision worker is busy or restarting
@jobs_app.periodic(cron="*/2 * * * *")
@jobs_app.task(name="recover_stalled_jobs", queue="push")
async def recover_stalled_jobs(timestamp: int) -> None:
    await recover_stalled(jobs_app)
