"""Jobs stranded by a dead worker go back into the queue."""

from types import SimpleNamespace

from app import maintenance
from app.jobs import jobs_app


class FakeManager:
    def __init__(self, stalled):
        self.stalled, self.retried, self.asked = stalled, [], None

    async def get_stalled_jobs(self, seconds_since_heartbeat):
        self.asked = seconds_since_heartbeat
        return self.stalled

    async def retry_job(self, job):
        self.retried.append(job.id)


def job(id_, task="analyze_photo"):
    return SimpleNamespace(id=id_, task_name=task, task_kwargs={"job_id": 12})


async def test_retries_jobs_whose_worker_stopped_reporting():
    manager = FakeManager([job(41), job(42, "generate_recipe")])
    assert await maintenance.recover_stalled(SimpleNamespace(job_manager=manager)) == [41, 42]
    assert manager.retried == [41, 42]
    assert manager.asked == maintenance.STALLED_AFTER_S


async def test_nothing_to_do_when_all_workers_are_alive():
    manager = FakeManager([])
    assert await maintenance.recover_stalled(SimpleNamespace(job_manager=manager)) == []
    assert manager.retried == []


def test_runs_every_two_minutes_on_the_push_worker():
    periodic = jobs_app.periodic_registry.periodic_tasks[("recover_stalled_jobs", "")]
    assert (periodic.task.queue, periodic.cron) == ("push", "*/2 * * * *")


async def test_a_retried_analysis_runs_again_from_running(client, auth, seeded):
    """The analysis left "running" by the dead worker is picked up, not skipped."""
    from app.analysis.models import AnalysisJob
    from tests.fakes import vision_transport
    from tests.test_analysis import process
    from tests.test_analysis_queue import snap

    job_id = await snap(client, auth)
    row = await seeded.get(AnalysisJob, job_id)
    row.status = "running"
    await seeded.commit()
    done = await process(seeded, job_id, vision_transport())
    assert done.status == "done"
