"""Undo a post right after it; editing a meal's recipe steps."""

from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app.inventory.models import RanOut
from app.meals.models import Meal
from tests.conftest import ingredient_ids, register
from tests.fakes import vision_transport
from tests.test_analysis import process
from tests.test_analysis_queue import RATING, open_jobs, partner_of, snap
from tests.test_inventory import Q, add
from tests.test_meals import body
from tests.test_suggestions import pending

DAY = "2026-10-04"


async def stock(client, headers) -> dict[str, float]:
    items = (await client.get(f"/api/inventory?{Q}", headers=headers)).json()
    return {i["ingredient"]["name"]: i["grams"] for i in items}


async def shopping_ran_out(client, headers) -> list[str]:
    data = (await client.get("/api/shopping", headers=headers)).json()
    return sorted(i["ingredient"]["name"] for i in data["items"] if i["ran_out"])


async def posted_photo(client, headers, seeded, **over):
    job = await snap(client, headers)
    await process(seeded, job, vision_transport())
    response = await client.post(
        "/api/meals", json=await body(seeded, analysis_id=job, **over), headers=headers
    )
    assert response.status_code == 201, response.text
    return job, response.json()


async def test_undo_puts_everything_back_and_reopens_the_photo(client, auth, seeded):
    chicken, rice = await ingredient_ids(seeded, "Chicken breast", "Rice (cooked)")
    await add(client, auth, chicken, grams=500)
    await add(client, auth, rice, grams=300)  # the recipe takes 400 g: all of it goes
    before = await stock(client, auth)
    job = await snap(client, auth)
    await client.put(f"/api/analyses/{job}/rating", json=RATING, headers=auth)  # rated early
    await process(seeded, job, vision_transport())
    meal = (
        await client.post(
            "/api/meals", json=await body(seeded, analysis_id=job, used_up=[rice]), headers=auth
        )
    ).json()
    assert meal["undo_until"] is not None
    assert await stock(client, auth) == {"Chicken breast": 200}
    assert await shopping_ran_out(client, auth) == ["Rice (cooked)"]

    response = await client.post(f"/api/meals/{meal['id']}/undo", headers=auth)
    assert response.status_code == 200, response.text
    assert response.json() == {"analysis_id": job}

    assert await stock(client, auth) == before
    assert await shopping_ran_out(client, auth) == []
    assert (await client.get(f"/api/meals/{meal['id']}", headers=auth)).status_code == 404
    day = (await client.get(f"/api/day?date={DAY}", headers=auth)).json()
    assert day["entries"] == []
    assert [j["id"] for j in await open_jobs(client, auth)] == [job]  # back in the banner
    again = (await client.get(f"/api/analyses/{job}", headers=auth)).json()
    assert again["my_rating"]["taste"] == 4.5  # the rating waits for the next post
    # …and it can be posted again
    repost = await client.post("/api/meals", json=await body(seeded, analysis_id=job), headers=auth)
    assert repost.status_code == 201


async def test_undo_keeps_ran_out_items_that_were_already_on_the_list(client, auth, seeded):
    (rice,) = await ingredient_ids(seeded, "Rice (cooked)")
    await add(client, auth, rice, grams=100)
    first = await client.post("/api/meals", json=await body(seeded, used_up=[rice]), headers=auth)
    assert first.status_code == 201
    _, second = await posted_photo(client, auth, seeded, used_up=[rice])  # already listed
    await client.post(f"/api/meals/{second['id']}/undo", headers=auth)
    assert await shopping_ran_out(client, auth) == ["Rice (cooked)"]  # from the first post
    assert len(list(await seeded.scalars(select(RanOut)))) == 1


async def test_undo_saved_for_later_and_typed_meals(client, auth, seeded):
    saved = await body(seeded, eaten=False, eaten_on=None)
    later = (await client.post("/api/meals", json=saved, headers=auth)).json()
    response = await client.post(f"/api/meals/{later['id']}/undo", headers=auth)
    assert response.json() == {"analysis_id": None}
    assert (await client.get("/api/meals", headers=auth)).json() == []


async def test_undo_only_by_who_posted_it_within_ten_minutes(client, auth, seeded):
    partner = await partner_of(client, auth)
    _, meal = await posted_photo(client, auth, seeded)
    theirs = (await client.get(f"/api/meals/{meal['id']}", headers=partner)).json()
    assert theirs["undo_until"] is None  # no button for the partner
    denied = await client.post(f"/api/meals/{meal['id']}/undo", headers=partner)
    assert denied.status_code == 403

    stranger = await register(client, email="x@example.com")
    assert (await client.post(f"/api/meals/{meal['id']}/undo", headers=stranger)).status_code == 404

    row = await seeded.get(Meal, meal["id"])
    row.created_at = datetime.now(UTC) - timedelta(minutes=11)
    await seeded.commit()
    late = await client.post(f"/api/meals/{meal['id']}/undo", headers=auth)
    assert late.status_code == 409
    assert (await client.get(f"/api/meals/{meal['id']}", headers=auth)).json()["undo_until"] is None


async def test_no_undo_once_the_partner_logged_it_too(client, auth, seeded):
    partner = await partner_of(client, auth)
    _, meal = await posted_photo(client, auth, seeded)
    (suggestion,) = await pending(client, partner)
    await client.post(f"/api/suggestions/{suggestion['id']}/accept", json={}, headers=partner)
    response = await client.post(f"/api/meals/{meal['id']}/undo", headers=auth)
    assert response.status_code == 409
    assert response.json()["detail"] == "Ana logged it too, so it stays"


async def test_undo_drops_the_pending_you_too_suggestion(client, auth, seeded):
    partner = await partner_of(client, auth)
    _, meal = await posted_photo(client, auth, seeded)
    assert len(await pending(client, partner)) == 1
    await client.post(f"/api/meals/{meal['id']}/undo", headers=auth)
    assert await pending(client, partner) == []


async def test_meals_posted_before_this_feature_cannot_be_undone(client, auth, seeded):
    _, meal = await posted_photo(client, auth, seeded)
    row = await seeded.get(Meal, meal["id"])
    row.undo = None
    await seeded.commit()
    assert (await client.post(f"/api/meals/{meal['id']}/undo", headers=auth)).status_code == 409


# --- recipe steps -----------------------------------------------------------------------


async def test_edit_steps_and_the_model_leaves_them_alone(client, auth, seeded):
    from app.meals.tasks import improve_recipe

    _, meal = await posted_photo(client, auth, seeded)
    response = await client.patch(
        f"/api/meals/{meal['id']}",
        json={"steps": ["  Cook the rice. ", "", "Grill the chicken and serve."]},
        headers=auth,
    )
    assert response.status_code == 200, response.text
    out = response.json()
    assert out["steps"] == ["Cook the rice.", "Grill the chicken and serve."]
    assert out["steps_source"] == "ours"

    class Chain:  # would answer if asked
        async def chat_json(self, *_):
            raise AssertionError("must not rewrite our steps")

    assert await improve_recipe(seeded, meal["id"], Chain()) is False


async def test_steps_validation(client, auth, seeded):
    _, meal = await posted_photo(client, auth, seeded)
    url = f"/api/meals/{meal['id']}"
    for bad in ([], ["", "  "], ["x" * 501], ["step"] * 31):
        assert (await client.patch(url, json={"steps": bad}, headers=auth)).status_code == 422
    stranger = await register(client, email="x@example.com")
    assert (await client.patch(url, json={"steps": ["a"]}, headers=stranger)).status_code == 404
