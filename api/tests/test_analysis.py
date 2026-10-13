import base64
import io
import json

import httpx
import pytest
from PIL import Image
from pydantic import ValidationError

from app.analysis.models import AnalysisJob
from app.analysis.photos import normalize_photo, shrink_jpeg
from app.analysis.service import run_analysis
from app.config import Settings, get_settings
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
            session,
            job_id,
            chain_from_settings(settings, http),
            settings.photo_dir,
            vision_max_px=settings.vision_max_px,
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


async def test_upload_accepts_iphone_heic(client, auth):
    img = Image.new("RGB", (3024, 4032), (180, 120, 60))
    heic = io.BytesIO()
    img.save(heic, format="HEIF")
    response = await upload(client, auth, heic.getvalue(), filename="IMG_0001.HEIC")
    assert response.status_code == 202, response.text
    photo = await client.get(response.json()["photo_url"], headers=auth)
    stored = Image.open(io.BytesIO(photo.content))
    assert stored.format == "JPEG"
    assert stored.size == (960, 1280)


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


def sent_image_size(request: httpx.Request) -> tuple[int, int]:
    """Size of the photo inside an OpenAI-style chat request."""
    content = json.loads(request.content)["messages"][-1]["content"]
    url = next(part["image_url"]["url"] for part in content if part["type"] == "image_url")
    jpeg = base64.b64decode(url.split(",", 1)[1])
    return Image.open(io.BytesIO(jpeg)).size


async def test_worker_sends_smaller_photo_to_model_but_keeps_stored_photo(
    client, auth, session, monkeypatch
):
    settings = get_settings()
    monkeypatch.setattr(settings, "photo_max_px", 1280)
    monkeypatch.setattr(settings, "vision_max_px", 768)
    job_id = (await upload(client, auth, jpeg_bytes(size=(4000, 3000)))).json()["id"]

    seen: list = []
    job = await process(session, job_id, vision_transport(seen=seen))

    assert job.status == "done"
    assert sent_image_size(seen[0]) == (768, 576)
    photo = await client.get(f"/api/analyses/{job_id}/photo", headers=auth)
    assert Image.open(io.BytesIO(photo.content)).size == (1280, 960)


async def test_worker_sends_small_photo_unchanged(client, auth, session, monkeypatch):
    monkeypatch.setattr(get_settings(), "vision_max_px", 768)
    job_id = (await upload(client, auth, jpeg_bytes(size=(640, 480)))).json()["id"]

    seen: list = []
    await process(session, job_id, vision_transport(seen=seen))

    assert sent_image_size(seen[0]) == (640, 480)


def test_shrink_jpeg_keeps_bytes_when_already_small():
    small = normalize_photo(jpeg_bytes(size=(300, 200)), 1280)
    assert shrink_jpeg(small, 300) is small
    assert shrink_jpeg(small, 2000) is small


def test_shrink_jpeg_resizes_portrait_by_long_side():
    tall = normalize_photo(jpeg_bytes(size=(960, 1280)), 1280)
    assert Image.open(io.BytesIO(shrink_jpeg(tall, 896))).size == (672, 896)


def test_vision_max_px_must_be_positive(monkeypatch):
    monkeypatch.setenv("VISION_MAX_PX", "0")
    with pytest.raises(ValidationError):
        Settings()
