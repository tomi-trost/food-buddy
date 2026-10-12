"""Meals saved for later: in the library, but not eaten (no log, no stock change, no reminder)."""

from sqlalchemy import select

from app.inventory.models import InventoryItem
from app.logs.models import FoodLog
from app.meals.models import CookLog
from tests.conftest import jpeg_bytes
from tests.test_meals import TODAY, body, stock


async def snap(client, headers, **form) -> dict:
    files = {"photo": ("p.jpg", jpeg_bytes(), "image/jpeg")}
    response = await client.post("/api/analyses", files=files, data=form, headers=headers)
    assert response.status_code == 202, response.text
    return response.json()


async def test_saved_meal_is_in_library_but_not_eaten(client, auth, seeded, queue):
    chicken = await stock(seeded, "Chicken breast", 400)
    payload = await body(seeded, eaten=False, eaten_on=None, meal_type="dinner")

    response = await client.post("/api/meals", json=payload, headers=auth)

    assert response.status_code == 201, response.text
    meal = response.json()
    assert meal["types"] == ["dinner"] and meal["cooked_count"] == 0
    assert meal["last_cooked"] is None
    assert list(await seeded.scalars(select(FoodLog))) == []
    assert list(await seeded.scalars(select(CookLog))) == []
    seeded.expire_all()
    left = {i.ingredient_id: i.grams for i in await seeded.scalars(select(InventoryItem))}
    assert left == {chicken: 400}  # nothing taken out of the fridge
    # still gets a written recipe, but no "rate it" reminder
    assert [j["task_name"] for j in queue.jobs.values()] == ["generate_recipe"]

    cards = (await client.get("/api/meals", headers=auth)).json()
    assert [c["name"] for c in cards] == ["Chicken rice bowl"]
    day = (await client.get(f"/api/day?date={TODAY.isoformat()}", headers=auth)).json()
    assert day["totals"]["kcal"] == 0


async def test_eaten_meal_needs_a_date_and_saved_meal_cannot_use_up(client, auth, seeded):
    no_date = await body(seeded, eaten_on=None)
    assert (await client.post("/api/meals", json=no_date, headers=auth)).status_code == 422
    (oil,) = [i["ingredient_id"] for i in no_date["items"][2:]]
    used_up = await body(seeded, eaten=False, used_up=[oil])
    response = await client.post("/api/meals", json=used_up, headers=auth)
    assert response.status_code == 422
    assert "saved for later can't use up" in response.text


async def test_eaten_is_the_default(client, auth, seeded, queue):
    payload = await body(seeded)
    assert "eaten" not in payload
    await client.post("/api/meals", json=payload, headers=auth)
    assert len(list(await seeded.scalars(select(FoodLog)))) == 1


async def test_saved_meal_from_photo_closes_the_photo(client, auth, seeded, queue):
    job = await snap(client, auth, kind="meal", meal_type="breakfast", save_only="true")
    payload = await body(seeded, eaten=False, analysis_id=job["id"])
    meal = (await client.post("/api/meals", json=payload, headers=auth)).json()
    assert meal["photo_url"] == f"/api/meals/{meal['id']}/photo"
    assert (await client.get("/api/analyses/open", headers=auth)).json() == []


async def test_photo_remembers_meal_type_and_save_choice(client, auth):
    job = await snap(client, auth, kind="meal", meal_type="dinner", save_only="true")
    assert (job["meal_type"], job["save_only"]) == ("dinner", True)
    again = (await client.get(f"/api/analyses/{job['id']}", headers=auth)).json()
    assert (again["meal_type"], again["save_only"]) == ("dinner", True)


async def test_photo_choice_defaults_and_validation(client, auth):
    plain = await snap(client, auth)
    assert (plain["meal_type"], plain["save_only"]) == (None, False)
    snack = await snap(client, auth, kind="snack", meal_type="dinner", save_only="true")
    assert (snack["meal_type"], snack["save_only"]) == (None, False)  # only meals have these

    files = {"photo": ("p.jpg", jpeg_bytes(), "image/jpeg")}
    bad = await client.post(
        "/api/analyses", files=files, data={"meal_type": "brunch"}, headers=auth
    )
    assert bad.status_code == 422
