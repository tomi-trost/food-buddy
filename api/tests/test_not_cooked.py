"""Bought and eaten-out food: logged for the nutrition only, out of our meals unless saved."""

import pytest
from sqlalchemy import select

from app.inventory.models import InventoryItem
from tests.conftest import register
from tests.test_analysis_queue import partner_of
from tests.test_meals import TODAY, body, stock


async def post(client, auth, seeded, **over) -> dict:
    response = await client.post("/api/meals", json=await body(seeded, **over), headers=auth)
    assert response.status_code == 201, response.text
    return response.json()


async def test_eaten_out_is_logged_without_recipe_stock_or_rating(client, auth, seeded, queue):
    chicken = await stock(seeded, "Chicken breast", 400)
    meal = await post(
        client, auth, seeded, origin="out", place="  Trattoria Rosa ", cost=14.5, portions=3
    )

    assert (meal["origin"], meal["listed"], meal["place"]) == ("out", False, "Trattoria Rosa")
    assert (meal["portions"], meal["prep_minutes"], meal["steps"]) == (1, 0, [])
    assert meal["cost"] == 14.5  # what we paid
    # the plate is what we ate: 150 g chicken, not 3 portions' worth
    assert {i["ingredient"]["name"]: i["grams"] for i in meal["ingredients"]}[
        "Chicken breast"
    ] == 150
    seeded.expire_all()
    left = {i.ingredient_id: i.grams for i in await seeded.scalars(select(InventoryItem))}
    assert left == {chicken: 400}  # nothing left our fridge
    assert [j["task_name"] for j in queue.jobs.values()] == []  # no recipe, no "rate it" push

    day = (await client.get(f"/api/day?date={TODAY.isoformat()}", headers=auth)).json()
    assert [e["meal_id"] for e in day["entries"]] == [meal["id"]]
    assert day["totals"]["kcal"] > 0
    assert (await client.get("/api/meals", headers=auth)).json() == []  # not in our meals


async def test_bought_food_can_be_saved_to_our_meals(client, auth, seeded, queue):
    meal = await post(client, auth, seeded, origin="bought", place="Lidl", cost=3.2)
    saved = await client.patch(f"/api/meals/{meal['id']}", json={"listed": True}, headers=auth)
    assert saved.status_code == 200 and saved.json()["listed"] is True
    cards = (await client.get("/api/meals", headers=auth)).json()
    assert [(c["id"], c["origin"], c["place"]) for c in cards] == [(meal["id"], "bought", "Lidl")]


async def test_logging_bought_food_again_never_takes_stock(client, auth, seeded, queue):
    await stock(seeded, "Chicken breast", 400)
    meal = await post(client, auth, seeded, origin="bought")
    again = {"meal_type": "lunch", "eaten_on": TODAY.isoformat(), "cooked": True}
    response = await client.post(f"/api/meals/{meal['id']}/cook", json=again, headers=auth)
    assert response.status_code == 200, response.text
    seeded.expire_all()
    assert [i.grams for i in await seeded.scalars(select(InventoryItem))] == [400]
    assert (await client.get(f"/api/meals/{meal['id']}", headers=auth)).json()["origin"] == "bought"


@pytest.mark.parametrize(
    "over",
    [
        {"origin": "out", "eaten": False},  # only home-cooked meals are saved for later
        {"origin": "cafe"},
        {"origin": "home", "place": "Lidl"},
        {"origin": "out", "place": "x" * 81},
    ],
)
async def test_not_cooked_validation(client, auth, seeded, over):
    response = await client.post("/api/meals", json=await body(seeded, **over), headers=auth)
    assert response.status_code == 422


async def test_eaten_out_cannot_use_up_our_ingredients(client, auth, seeded):
    oil = await stock(seeded, "Olive oil", 500)
    payload = await body(seeded, origin="out", used_up=[oil])
    assert (await client.post("/api/meals", json=payload, headers=auth)).status_code == 422


async def test_insights_count_eating_out_and_bought_per_person(client, auth, seeded, queue):
    partner = await partner_of(client, auth)
    await post(client, auth, seeded, origin="out", cost=14)
    await post(client, auth, seeded, origin="bought", cost=4, servings_eaten=0.5)
    await post(client, auth, seeded, cost=9)  # home-cooked: not counted
    await post(client, partner, seeded, origin="out", cost=20, eaten_on="2026-09-01")  # too old

    data = (await client.get(f"/api/insights?end={TODAY.isoformat()}&days=7", headers=auth)).json()
    by_name = {m["name"]: m["not_cooked"] for m in data["members"]}
    assert by_name["Tomi"] == {"out": 1, "bought": 1, "spent": 16.0}  # 14 + half of 4
    assert by_name["Ana"] == {"out": 0, "bought": 0, "spent": 0}

    stranger = await register(client, email="x@example.com", household_name="Other")
    other = (await client.get(f"/api/insights?end={TODAY.isoformat()}", headers=stranger)).json()
    assert other["members"][0]["not_cooked"]["out"] == 0
