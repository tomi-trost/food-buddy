"""Typing a dish instead of snapping it: same job, same check screen, no photo."""

import json

import pytest

from tests.fakes import PLATE, vision_transport
from tests.test_analysis import process
from tests.test_meals import body

TIRAMISU = {"kcal": 420, "protein": 7, "carbs": 38, "fat": 26, "fiber": 0.5, "sugar": 27}


async def describe(client, headers, **json_body):
    return await client.post(
        "/api/analyses/text", json={"kind": "meal"} | json_body, headers=headers
    )


async def test_typed_meal_queues_a_job_without_photo(client, auth, queue):
    response = await describe(client, auth, text="  Spaghetti carbonara ", meal_type="dinner")
    assert response.status_code == 202
    job = response.json()
    assert (job["kind"], job["status"], job["meal_type"]) == ("meal", "queued", "dinner")
    assert job["photo_url"] is None and job["description"] == "Spaghetti carbonara"
    assert [j["args"] for j in queue.jobs.values()] == [{"job_id": job["id"]}]
    assert (await client.get(f"/api/analyses/{job['id']}/photo", headers=auth)).status_code == 404


async def test_typed_meal_is_estimated_from_text_and_grounded(client, auth, seeded, queue):
    job = (await describe(client, auth, text="chicken rice bowl")).json()
    seen = []
    done = await process(seeded, job["id"], vision_transport(PLATE, seen=seen))

    assert done.status == "done"
    assert done.result["items"][0]["ingredient"]["name"] == "Chicken breast"
    sent = json.loads(seen[0].content)
    assert sent["response_format"]["json_schema"]["name"] == "MealAnalysis"
    user = sent["messages"][1]
    assert user["content"] == "chicken rice bowl"  # plain text: no image part
    assert "typical single serving" in sent["messages"][0]["content"]

    # posting works like a snapped meal, just without a photo
    meal = await client.post(
        "/api/meals", json=await body(seeded, analysis_id=job["id"]), headers=auth
    )
    assert meal.status_code == 201, meal.text
    assert meal.json()["photo_url"] is None


async def test_typed_snack_gives_values_per_piece(client, auth, session, queue):
    job = (await describe(client, auth, kind="snack", text="2 slices of tiramisu")).json()
    answer = {"name": "Tiramisu", "kind": "sweet", "unit": "piece", "amount": 2, "values": TIRAMISU}
    seen = []
    await process(session, job["id"], vision_transport(answer, seen=seen))

    snack = (await client.get(f"/api/analyses/{job['id']}", headers=auth)).json()["snack"]
    assert snack == {
        "name": "Tiramisu",
        "kind": "sweet",
        "per": "piece",
        "amount": 2,
        "per_unit": TIRAMISU,
    }
    assert json.loads(seen[0].content)["messages"][1]["content"] == "2 slices of tiramisu"


async def test_failed_text_job_can_be_retried(client, auth, session, queue):
    job = (await describe(client, auth, text="pasta")).json()
    failed = await process(session, job["id"], vision_transport(status=500))
    assert failed.status == "failed"
    retried = await client.post(f"/api/analyses/{job['id']}/retry", headers=auth)
    assert retried.status_code == 202 and retried.json()["description"] == "pasta"


@pytest.mark.parametrize(
    "over",
    [
        {"text": ""},
        {"text": "   "},
        {"text": "x" * 201},
        {"kind": "label", "text": "biscotti"},  # a label needs its photo
        {"meal_type": "brunch", "text": "eggs"},
    ],
)
async def test_text_validation(client, auth, over):
    assert (await describe(client, auth, **over)).status_code == 422


async def test_text_needs_login(client):
    assert (await describe(client, {}, text="pasta")).status_code == 401
