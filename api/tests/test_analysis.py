import io

import httpx
import pytest
from PIL import Image

from app.analysis.models import AnalysisJob
from app.analysis.photos import normalize_photo
from app.analysis.service import run_analysis
from app.config import get_settings
from app.nutrition.seed import seed_mock
from app.vision.providers import chain_from_settings
from tests.conftest import jpeg_bytes, register
from tests.fakes import vision_transport


async def upload(client, headers, data=None, filename="plate.jpg"):
    files = {"photo": (filename, data or jpeg_bytes(), "image/jpeg")}
    return await client.post("/api/analyses", files=files, headers=headers)


async def process(session, job_id, transport):
    settings = get_settings()
    async with httpx.AsyncClient(transport=transport) as http:
        return await run_analysis(
            session, job_id, chain_from_settings(settings, http), settings.photo_dir
        )


async def test_upload_queues_job_and_stores_resized_photo(client, auth, queue):
    big = jpeg_bytes(size=(4000, 3000))
    response = await upload(client, auth, big)

    assert response.status_code == 202
    job = response.json()
    assert job["status"] == "queued"
    assert job["result"] is None
    assert [j["args"] for j in queue.jobs.values()] == [{"job_id": job["id"]}]

    photo = await client.get(job["photo_url"], headers=auth)
    assert photo.status_code == 200
    assert max(Image.open(io.BytesIO(photo.content)).size) == get_settings().photo_max_px


async def test_upload_rejects_non_images_and_requires_auth(client, auth):
    bad = await upload(client, auth, b"definitely not an image")
    assert bad.status_code == 422
    anonymous = await upload(client, {})
    assert anonymous.status_code == 401


async def test_upload_rejects_too_large(client, auth, monkeypatch):
    monkeypatch.setattr(get_settings(), "max_upload_mb", 0)
    assert (await upload(client, auth)).status_code == 413


async def test_worker_grounds_ingredients_and_computes_totals(client, auth, session):
    await seed_mock(session)
    job_id = (await upload(client, auth)).json()["id"]

    job = await process(session, job_id, vision_transport())
    assert job.status == "done"
    assert job.provider == "test"

    result = (await client.get(f"/api/analyses/{job_id}", headers=auth)).json()["result"]
    by_name = {i["name"]: i for i in result["items"]}
    assert by_name["grilled chicken breast"]["ingredient"]["name"] == "Chicken breast"
    assert by_name["grilled chicken breast"]["nutrients"]["kcal"] == 247.5  # 165 × 1.5
    assert by_name["mystery sauce"]["ingredient"] is None
    assert result["unmatched"] == 1
    # chicken 247.5 + rice 260 + oil 88.4; the unmatched sauce adds nothing
    assert result["totals"]["kcal"] == 595.9
    assert result["totals"]["protein"] == 51.9


async def test_worker_marks_job_failed_when_no_provider_answers(client, auth, session):
    job_id = (await upload(client, auth)).json()["id"]
    job = await process(session, job_id, vision_transport(status=503))
    assert job.status == "failed"
    assert "test" in job.error
    assert job.finished_at is not None

    body = (await client.get(f"/api/analyses/{job_id}", headers=auth)).json()
    assert body["status"] == "failed"
    assert body["result"] is None


async def test_worker_skips_already_finished_job(client, auth, session):
    await seed_mock(session)
    job_id = (await upload(client, auth)).json()["id"]
    await process(session, job_id, vision_transport())
    seen: list = []
    again = await process(session, job_id, vision_transport(seen=seen))
    assert again.status == "done"
    assert seen == []  # the model was not called a second time


async def test_other_household_cannot_see_job(client, auth, session):
    job_id = (await upload(client, auth)).json()["id"]
    stranger = await register(client, email="other@example.com", household_name="Other")
    assert (await client.get(f"/api/analyses/{job_id}", headers=stranger)).status_code == 404
    photo = await client.get(f"/api/analyses/{job_id}/photo", headers=stranger)
    assert photo.status_code == 404
    assert await session.get(AnalysisJob, job_id) is not None


def test_normalize_photo_applies_exif_rotation():
    img = Image.new("RGB", (40, 20))
    exif = img.getexif()
    exif[0x0112] = 6  # orientation: rotate 90° when displayed
    out = io.BytesIO()
    img.save(out, format="JPEG", exif=exif)
    result = Image.open(io.BytesIO(normalize_photo(out.getvalue(), 1280)))
    assert result.size == (20, 40)


async def test_task_marks_job_failed_on_unexpected_error(client, auth, session, monkeypatch):
    from app.analysis import tasks

    job_id = (await upload(client, auth)).json()["id"]

    async def explode(*args, **kwargs):
        raise RuntimeError("database fell over")

    monkeypatch.setattr(tasks, "run_analysis", explode)
    with pytest.raises(RuntimeError):
        await tasks.analyze_photo.func(job_id=job_id)

    body = (await client.get(f"/api/analyses/{job_id}", headers=auth)).json()
    assert body["status"] == "failed"
    assert body["error"] == "Unexpected error while analyzing the photo"
