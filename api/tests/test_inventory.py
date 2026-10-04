from datetime import date, timedelta

from sqlalchemy import select

from app.inventory.models import RanOut
from tests.conftest import ingredient_ids, register
from tests.test_meals import body

TODAY = date(2026, 10, 4)
Q = f"today={TODAY.isoformat()}"


async def add(client, headers, iid, grams=None, today=TODAY):
    payload = {"ingredient_id": iid, "today": today.isoformat()}
    if grams:
        payload["grams"] = grams
    response = await client.post("/api/inventory", json=payload, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


async def test_add_uses_shelf_life_and_merges(client, auth, seeded):
    spinach, oats = await ingredient_ids(seeded, "Spinach", "Rolled oats")
    first = await add(client, auth, spinach)
    assert (first["grams"], first["days_left"]) == (250, 4)  # shelf_days 4
    assert first["ingredient"]["location"] == "fridge"
    again = await add(client, auth, spinach, grams=100, today=TODAY + timedelta(days=2))
    assert again["grams"] == 350
    assert again["expires_on"] == (TODAY + timedelta(days=6)).isoformat()  # fresher batch wins
    await add(client, auth, oats)

    items = (await client.get(f"/api/inventory?{Q}", headers=auth)).json()
    assert [i["ingredient"]["name"] for i in items] == ["Spinach", "Rolled oats"]  # soonest first
    assert items[1]["ingredient"]["location"] == "pantry"


async def test_change_and_refuse_to_go_to_zero(client, auth, seeded):
    (chicken,) = await ingredient_ids(seeded, "Chicken breast")
    await add(client, auth, chicken, grams=100)
    more = await client.patch(f"/api/inventory/{chicken}?{Q}", json={"delta": 50}, headers=auth)
    assert more.json()["grams"] == 150
    zero = await client.patch(f"/api/inventory/{chicken}?{Q}", json={"delta": -150}, headers=auth)
    assert zero.status_code == 422
    missing = await client.patch(f"/api/inventory/999?{Q}", json={"delta": 1}, headers=auth)
    assert missing.status_code == 404


async def test_remove_used_up_goes_to_shopping_list(client, auth, seeded):
    milk, eggs = await ingredient_ids(seeded, "Milk", "Eggs")
    await add(client, auth, milk)
    await add(client, auth, eggs)
    assert (
        await client.delete(f"/api/inventory/{milk}?used_up=true", headers=auth)
    ).status_code == 204
    assert (await client.delete(f"/api/inventory/{eggs}", headers=auth)).status_code == 204

    assert (await client.get(f"/api/inventory?{Q}", headers=auth)).json() == []
    assert [r.ingredient_id for r in await seeded.scalars(select(RanOut))] == [milk]
    assert (await client.delete(f"/api/inventory/{eggs}", headers=auth)).status_code == 404


async def test_stock_is_per_household(client, auth, seeded):
    (milk,) = await ingredient_ids(seeded, "Milk")
    await add(client, auth, milk)
    other = await register(client, email="x@example.com", household_name="Other")
    assert (await client.get(f"/api/inventory?{Q}", headers=other)).json() == []
    assert (await client.delete(f"/api/inventory/{milk}", headers=other)).status_code == 404


async def test_add_validation(client, auth, seeded):
    bad = await client.post(
        "/api/inventory", json={"ingredient_id": 999, "today": TODAY.isoformat()}, headers=auth
    )
    assert bad.status_code == 404
    no_date = await client.get("/api/inventory", headers=auth)
    assert no_date.status_code == 422


async def test_cookable_needs_half_of_every_ingredient(client, auth, seeded, queue):
    meal = (await client.post("/api/meals", json=await body(seeded), headers=auth)).json()
    # recipe: rice 400, chicken 300, oil 10 → need ≥ 200 / 150 / 5
    rice, chicken, oil = await ingredient_ids(
        seeded, "Rice (cooked)", "Chicken breast", "Olive oil"
    )
    await add(client, auth, rice, grams=200)
    await add(client, auth, oil, grams=500)
    await add(client, auth, chicken, grams=100)
    assert (await client.get("/api/inventory/cookable", headers=auth)).json() == []
    await add(client, auth, chicken, grams=50)
    cookable = (await client.get("/api/inventory/cookable", headers=auth)).json()
    assert [c["id"] for c in cookable] == [meal["id"]]
