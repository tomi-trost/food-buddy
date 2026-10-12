"""Background analysis: open jobs list, early ratings, discard/retry, closing on post/log."""

from app.analysis.models import AnalysisJob
from tests.conftest import jpeg_bytes, register
from tests.fakes import vision_transport
from tests.test_analysis import process
from tests.test_meals import body

RATING = {"taste": 4.5, "again": 5, "effort": 3, "fill": "right"}
SNACK_IN = {
    "eaten_on": "2026-10-04",
    "name": "Cookie",
    "emoji": "🍪",
    "kind": "sweet",
    "source": "photo",
    "per": "piece",
    "amount": 1,
    "per_unit": {"kcal": 80, "protein": 1, "carbs": 10, "fat": 4, "fiber": 0.5, "sugar": 6},
}


async def snap(client, headers, kind="meal") -> int:
    files = {"photo": ("p.jpg", jpeg_bytes(), "image/jpeg")}
    response = await client.post("/api/analyses", files=files, data={"kind": kind}, headers=headers)
    assert response.status_code == 202, response.text
    return response.json()["id"]


async def open_jobs(client, headers) -> list[dict]:
    response = await client.get("/api/analyses/open", headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


async def partner_of(client, owner) -> dict[str, str]:
    code = (await client.get("/api/auth/me", headers=owner)).json()["household"]["invite_code"]
    return await register(client, email="partner@example.com", name="Ana", invite_code=code)


async def finish(session, job_id, status="done"):
    job = await session.get(AnalysisJob, job_id)
    job.status = status
    job.error = "model timed out" if status == "failed" else None
    await session.commit()


async def test_open_lists_household_jobs_oldest_first_with_who_snapped(client, auth):
    partner = await partner_of(client, auth)
    first = await snap(client, auth)
    second = await snap(client, partner, kind="snack")

    for headers in (auth, partner):  # both of us see both
        jobs = await open_jobs(client, headers)
        assert [j["id"] for j in jobs] == [first, second]
    assert jobs[0]["by"] == {"id": jobs[0]["by"]["id"], "name": "Tomi"}
    assert jobs[1]["by"]["name"] == "Ana"
    assert jobs[0]["meal_id"] is None and jobs[0]["closed"] is False
    assert jobs[0]["my_rating"] is None


async def test_open_is_empty_without_jobs_and_hides_other_households(client, auth):
    assert await open_jobs(client, auth) == []
    stranger = await register(client, email="x@example.com")
    await snap(client, stranger)
    assert await open_jobs(client, auth) == []
    assert (await client.get("/api/analyses/open")).status_code == 401


async def test_early_rating_is_saved_per_person_and_can_be_changed(client, auth):
    partner = await partner_of(client, auth)
    job_id = await snap(client, auth)

    mine = await client.put(f"/api/analyses/{job_id}/rating", json=RATING, headers=auth)
    assert mine.status_code == 200, mine.text
    assert mine.json()["my_rating"]["taste"] == 4.5

    changed = RATING | {"taste": 3}
    await client.put(f"/api/analyses/{job_id}/rating", json=changed, headers=auth)
    assert (await open_jobs(client, auth))[0]["my_rating"]["taste"] == 3
    assert (await open_jobs(client, partner))[0]["my_rating"] is None


async def test_early_rating_validates_and_checks_access(client, auth):
    job_id = await snap(client, auth)
    bad = await client.put(
        f"/api/analyses/{job_id}/rating", json=RATING | {"taste": 4.2}, headers=auth
    )
    assert bad.status_code == 422

    stranger = await register(client, email="x@example.com")
    other = await client.put(f"/api/analyses/{job_id}/rating", json=RATING, headers=stranger)
    assert other.status_code == 404
    missing = await client.put("/api/analyses/999/rating", json=RATING, headers=auth)
    assert missing.status_code == 404


async def test_snacks_cannot_be_rated(client, auth):
    job_id = await snap(client, auth, kind="snack")
    response = await client.put(f"/api/analyses/{job_id}/rating", json=RATING, headers=auth)
    assert response.status_code == 422


async def test_posting_moves_early_ratings_of_both_onto_the_meal(client, auth, seeded):
    partner = await partner_of(client, auth)
    job_id = await snap(client, auth)
    await client.put(f"/api/analyses/{job_id}/rating", json=RATING, headers=auth)
    await client.put(
        f"/api/analyses/{job_id}/rating", json=RATING | {"taste": 2, "again": 1}, headers=partner
    )
    await finish(seeded, job_id)

    # the partner confirms the photo Tomi took
    posted = await client.post(
        "/api/meals", json=await body(seeded, analysis_id=job_id), headers=partner
    )
    assert posted.status_code == 201, posted.text
    ratings = {r["name"]: r["rating"] for r in posted.json()["ratings"]}
    assert ratings["Tomi"]["taste"] == 4.5
    assert ratings["Ana"] == RATING | {"taste": 2, "again": 1, "note": None}

    assert await open_jobs(client, auth) == []
    job = (await client.get(f"/api/analyses/{job_id}", headers=auth)).json()
    assert job["closed"] is True and job["meal_id"] == posted.json()["id"]


async def test_early_rating_after_post_is_rejected(client, auth, seeded):
    job_id = await snap(client, auth)
    await client.post("/api/meals", json=await body(seeded, analysis_id=job_id), headers=auth)
    response = await client.put(f"/api/analyses/{job_id}/rating", json=RATING, headers=auth)
    assert response.status_code == 409


async def test_second_post_of_same_photo_says_already_posted(client, auth, seeded):
    partner = await partner_of(client, auth)
    job_id = await snap(client, auth)
    first = await client.post(
        "/api/meals", json=await body(seeded, analysis_id=job_id), headers=auth
    )
    second = await client.post(
        "/api/meals", json=await body(seeded, analysis_id=job_id), headers=partner
    )
    assert second.status_code == 409
    assert second.json()["detail"] == "This photo was already posted"
    # the job tells the late one where the meal is
    job = (await client.get(f"/api/analyses/{job_id}", headers=partner)).json()
    assert job["meal_id"] == first.json()["id"]


async def test_discard_closes_job_and_drops_early_ratings(client, auth, seeded):
    partner = await partner_of(client, auth)
    job_id = await snap(client, auth)
    await client.put(f"/api/analyses/{job_id}/rating", json=RATING, headers=auth)

    response = await client.post(f"/api/analyses/{job_id}/discard", headers=partner)
    assert response.status_code == 200, response.text
    assert response.json()["closed"] is True
    assert await open_jobs(client, auth) == []
    # a discarded photo can't be posted or rated any more
    late = await client.post(
        "/api/meals", json=await body(seeded, analysis_id=job_id), headers=auth
    )
    assert late.status_code == 409
    rated = await client.put(f"/api/analyses/{job_id}/rating", json=RATING, headers=auth)
    assert rated.status_code == 409


async def test_discard_twice_is_fine_but_not_after_post(client, auth, seeded):
    job_id = await snap(client, auth)
    assert (await client.post(f"/api/analyses/{job_id}/discard", headers=auth)).status_code == 200
    assert (await client.post(f"/api/analyses/{job_id}/discard", headers=auth)).status_code == 200

    posted_id = await snap(client, auth)
    await client.post("/api/meals", json=await body(seeded, analysis_id=posted_id), headers=auth)
    response = await client.post(f"/api/analyses/{posted_id}/discard", headers=auth)
    assert response.status_code == 409

    stranger = await register(client, email="x@example.com")
    other = await client.post(f"/api/analyses/{posted_id}/discard", headers=stranger)
    assert other.status_code == 404


async def test_retry_requeues_failed_job_only(client, auth, seeded, queue):
    job_id = await snap(client, auth)
    not_failed = await client.post(f"/api/analyses/{job_id}/retry", headers=auth)
    assert not_failed.status_code == 409

    await finish(seeded, job_id, status="failed")
    response = await client.post(f"/api/analyses/{job_id}/retry", headers=auth)
    assert response.status_code == 202, response.text
    job = response.json()
    assert job["status"] == "queued" and job["error"] is None
    assert [j["args"] for j in queue.jobs.values()] == [{"job_id": job_id}] * 2


async def test_retry_rejects_closed_job(client, auth, seeded):
    job_id = await snap(client, auth)
    await finish(seeded, job_id, status="failed")
    await client.post(f"/api/analyses/{job_id}/discard", headers=auth)
    response = await client.post(f"/api/analyses/{job_id}/retry", headers=auth)
    assert response.status_code == 409


async def test_logging_snack_closes_its_job(client, auth):
    job_id = await snap(client, auth, kind="snack")
    response = await client.post(
        "/api/snacks", json=SNACK_IN | {"analysis_id": job_id}, headers=auth
    )
    assert response.status_code == 201, response.text
    assert await open_jobs(client, auth) == []

    again = await client.post("/api/snacks", json=SNACK_IN | {"analysis_id": job_id}, headers=auth)
    assert again.status_code == 409


async def test_logging_snack_checks_job_access(client, auth):
    stranger = await register(client, email="x@example.com")
    job_id = await snap(client, stranger, kind="snack")
    response = await client.post(
        "/api/snacks", json=SNACK_IN | {"analysis_id": job_id}, headers=auth
    )
    assert response.status_code == 404
    # without a photo it still works as before
    plain = await client.post("/api/snacks", json=SNACK_IN, headers=auth)
    assert plain.status_code == 201


async def test_worker_skips_discarded_job(client, auth, session):
    job_id = await snap(client, auth)
    await client.post(f"/api/analyses/{job_id}/discard", headers=auth)
    seen: list = []
    job = await process(session, job_id, vision_transport(seen=seen))
    assert seen == []  # the model was never called
    assert job.status == "queued"
