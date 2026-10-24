"""Bundles (#17): a plate holding portions of another meal of ours (a dish with its own recipe)."""

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select, update

from app.logs.models import FoodLog
from app.meals.bundles import flat_recipe
from app.meals.models import Meal, MealComponent
from tests.conftest import ingredient_ids, register
from tests.test_inventory import Q, add
from tests.test_meals import TODAY
from tests.test_plan_api import cook, kitchen, make_meal, new_plan  # noqa: F401 (kitchen: fixture)
from tests.test_plan_api import partner as plan_partner

# One portion of pancakes: banana 100 (89) + oats 50 (194.5) + eggs 50 (71.5) + milk 100 (42)
PANCAKE_KCAL = 397
AVOCADO_KCAL = 128  # 80 g on the plate


async def pancake_plate(session, **over) -> dict:
    """Pancakes with avocado; we made 4 portions of pancakes and 2 plates."""
    banana, oats, eggs, milk, avocado = await ingredient_ids(
        session, "Banana", "Rolled oats", "Eggs", "Milk", "Avocado"
    )
    data = {
        "name": "Pancakes with avocado",
        "meal_type": "breakfast",
        "eaten_on": TODAY.isoformat(),
        "prep_minutes": 25,
        "portions": 2,
        "servings_eaten": 1,
        "items": [{"ingredient_id": avocado, "grams": 80}],
        "components": [
            {
                "new": {
                    "name": "Healthy banana pancakes",
                    "portions": 4,
                    "items": [
                        {"ingredient_id": banana, "grams": 100},
                        {"ingredient_id": oats, "grams": 50},
                        {"ingredient_id": eggs, "grams": 50},
                        {"ingredient_id": milk, "grams": 100},
                    ],
                },
                "portions": 1,
            }
        ],
    }
    return data | over


async def post(client, auth, data) -> dict:
    response = await client.post("/api/meals", json=data, headers=auth)
    assert response.status_code == 201, response.text
    return response.json()


async def get(client, auth, meal_id) -> dict:
    response = await client.get(f"/api/meals/{meal_id}", headers=auth)
    assert response.status_code == 200, response.text
    return response.json()


async def logs(session) -> list[FoodLog]:
    query = select(FoodLog).order_by(FoodLog.id).execution_options(populate_existing=True)
    return list(await session.scalars(query))


async def test_making_a_dish_on_post(client, auth, seeded, queue):
    plate = await post(client, auth, await pancake_plate(seeded))

    assert [i["ingredient"]["name"] for i in plate["ingredients"]] == ["Avocado"]
    assert plate["ingredients"][0]["grams"] == 160  # plate × 2 portions
    [dish] = plate["components"]
    assert (dish["name"], dish["portions"], dish["grams"]) == ("Healthy banana pancakes", 2, 600)
    assert dish["per_portion"]["kcal"] == PANCAKE_KCAL
    assert {i["ingredient"]["name"]: i["grams"] for i in dish["ingredients"]} == {
        "Banana": 200,
        "Milk": 200,
        "Rolled oats": 100,
        "Eggs": 100,
    }
    # 4 portions: (100×0.2 + 50×0.1 + 50×0.5 + 100×0.1) / 100 × 4 = 2.4 €, half of it here
    assert dish["cost"] == 1.2
    assert plate["cost"] == round(1.2 + 160 * 0.8 / 100, 2)
    assert plate["per_portion"]["kcal"] == PANCAKE_KCAL + AVOCADO_KCAL
    assert plate["emoji"] == "🥑"  # its own heaviest ingredient
    [log] = await logs(seeded)
    assert log.kcal == PANCAKE_KCAL + AVOCADO_KCAL

    # The dish is a meal of ours with its own recipe for the 4 portions we made
    pancakes = await get(client, auth, dish["id"])
    assert pancakes["portions"] == 4
    assert pancakes["types"] == ["breakfast"]
    assert {i["ingredient"]["name"]: i["grams"] for i in pancakes["ingredients"]}["Banana"] == 400
    assert pancakes["used_in"] == [{"id": plate["id"], "name": plate["name"], "emoji": "🥑"}]
    assert pancakes["components"] == [] and pancakes["ratings"][0]["rating"] is None
    assert pancakes["logged_count"] == 0  # eating the plate doesn't log the dish

    cards = {c["name"]: c for c in (await client.get("/api/meals", headers=auth)).json()}
    assert cards["Pancakes with avocado"]["bundle"] is True
    assert cards["Healthy banana pancakes"]["bundle"] is False
    assert cards["Healthy banana pancakes"]["per_portion"]["kcal"] == PANCAKE_KCAL
    recipes = [
        j["args"]["meal_id"] for j in queue.jobs.values() if j["task_name"] == "generate_recipe"
    ]
    assert sorted(recipes) == sorted([plate["id"], dish["id"]])


async def test_a_plate_of_dishes_only(client, auth, seeded, queue):
    plate = await post(client, auth, await pancake_plate(seeded, items=[]))
    assert plate["ingredients"] == []
    assert plate["emoji"] == "🍌"  # the dish's
    assert plate["per_portion"]["kcal"] == PANCAKE_KCAL
    assert plate["portion_g"] == 300


async def test_cooking_takes_the_dishes_ingredients_out_of_stock(client, auth, seeded, queue):
    banana, oats, avocado = await ingredient_ids(seeded, "Banana", "Rolled oats", "Avocado")
    for iid in (banana, oats, avocado):
        await add(client, auth, iid, grams=1000)
    plate = await post(client, auth, await pancake_plate(seeded, used_up=[oats]))

    items = (await client.get(f"/api/inventory?{Q}", headers=auth)).json()
    left = {i["ingredient"]["name"]: i["grams"] for i in items}
    # the plate's 2 portions hold 2 of the 4 pancake portions: half of that recipe
    assert left == {"Banana": 800, "Avocado": 840}  # oats: used up
    shopping = (await client.get("/api/shopping", headers=auth)).json()
    assert [i["ingredient"]["name"] for i in shopping["items"] if i["ran_out"]] == ["Rolled oats"]

    cooked = await client.post(
        f"/api/meals/{plate['id']}/cook",
        json={"meal_type": "breakfast", "eaten_on": TODAY.isoformat(), "used_up": [banana]},
        headers=auth,
    )
    assert cooked.status_code == 200, cooked.text
    items = (await client.get(f"/api/inventory?{Q}", headers=auth)).json()
    assert {i["ingredient"]["name"]: i["grams"] for i in items} == {"Avocado": 680}


async def test_used_up_must_be_on_the_plate(client, auth, seeded, queue):
    (chicken,) = await ingredient_ids(seeded, "Chicken breast")
    response = await client.post(
        "/api/meals", json=await pancake_plate(seeded, used_up=[chicken]), headers=auth
    )
    assert response.status_code == 422
    assert (await seeded.scalars(select(Meal))).all() == []  # the new dish isn't kept either


async def test_existing_dish_and_validation(client, auth, seeded, queue):
    first = await post(client, auth, await pancake_plate(seeded))
    pancakes = first["components"][0]["id"]
    (avocado,) = await ingredient_ids(seeded, "Avocado")
    again = await pancake_plate(
        seeded, name="Pancakes again", components=[{"meal_id": pancakes, "portions": 1.5}]
    )
    plate = await post(client, auth, again)
    assert plate["components"][0]["portions"] == 3  # 1.5 per plate × 2 plates
    assert plate["per_portion"]["kcal"] == round(1.5 * PANCAKE_KCAL + AVOCADO_KCAL, 1)
    used_in = (await get(client, auth, pancakes))["used_in"]
    assert sorted(p["name"] for p in used_in) == ["Pancakes again", "Pancakes with avocado"]

    async def rejected(**over):
        response = await client.post(
            "/api/meals", json=await pancake_plate(seeded, **over), headers=auth
        )
        assert response.status_code == 422, response.text
        return response.json()["detail"]

    await rejected(items=[], components=[])  # nothing on the plate
    new_dish = (await pancake_plate(seeded))["components"][0]["new"]
    await rejected(components=[{"meal_id": pancakes, "portions": 1, "new": new_dish}])  # both
    await rejected(components=[{"portions": 1}])  # neither
    await rejected(components=[{"meal_id": pancakes, "portions": 0}])
    await rejected(components=[{"meal_id": pancakes, "portions": 1}] * 2)
    assert "holds dishes" in await rejected(components=[{"meal_id": plate["id"], "portions": 1}])
    assert "isn't one of our meals" in await rejected(components=[{"meal_id": 999, "portions": 1}])
    new = again | {
        "components": [{"new": {"name": "X", "portions": 1, "items": []}, "portions": 1}]
    }
    assert (await client.post("/api/meals", json=new, headers=auth)).status_code == 422

    # Another household's meal can't be a dish of ours
    other = await register(client, email="other@example.com", name="Other")
    response = await client.post(
        "/api/meals",
        json=await pancake_plate(seeded, components=[{"meal_id": pancakes, "portions": 1}]),
        headers=other,
    )
    assert response.status_code == 422
    assert avocado  # used above


async def test_a_dish_cant_become_a_bundle(client, auth, seeded, queue):
    plate = await post(client, auth, await pancake_plate(seeded))
    pancakes = plate["components"][0]["id"]
    second = await post(client, auth, await pancake_plate(seeded, name="Second", components=[]))
    response = await client.patch(
        f"/api/meals/{pancakes}",
        json={"components": [{"meal_id": second["id"], "portions": 1}]},
        headers=auth,
    )
    assert response.status_code == 422
    assert "is a dish in other plates" in response.json()["detail"]
    # the plate itself can't be its own dish
    response = await client.patch(
        f"/api/meals/{plate['id']}",
        json={"components": [{"meal_id": plate["id"], "portions": 1}]},
        headers=auth,
    )
    assert response.status_code == 422


async def test_editing_the_dish_updates_the_plates_days(client, auth, seeded, queue):
    plate = await post(client, auth, await pancake_plate(seeded))
    pancakes = await get(client, auth, plate["components"][0]["id"])
    typed = {"kcal": 500, "protein": 20, "carbs": 60, "fat": 15, "fiber": 6, "sugar": 20}
    response = await client.patch(
        f"/api/meals/{pancakes['id']}", json={"per_portion": typed}, headers=auth
    )
    assert response.status_code == 200, response.text
    assert (await get(client, auth, plate["id"]))["per_portion"]["kcal"] == 500 + AVOCADO_KCAL
    [log] = await logs(seeded)
    assert log.kcal == 500 + AVOCADO_KCAL


async def test_editing_the_plates_dishes(client, auth, seeded, queue):
    plate = await post(client, auth, await pancake_plate(seeded))
    pancakes = plate["components"][0]["id"]
    (avocado, spinach) = await ingredient_ids(seeded, "Avocado", "Spinach")
    url = f"/api/meals/{plate['id']}"

    more = await client.patch(
        url, json={"components": [{"meal_id": pancakes, "portions": 4}]}, headers=auth
    )
    assert more.status_code == 200, more.text
    assert more.json()["per_portion"]["kcal"] == 2 * PANCAKE_KCAL + AVOCADO_KCAL
    [log] = await logs(seeded)
    assert log.kcal == 2 * PANCAKE_KCAL + AVOCADO_KCAL

    # Make the avocado its own dish too, in Edit meal (items for one portion of it)
    split = await client.patch(
        url,
        json={
            "items": [],
            "components": [
                {"meal_id": pancakes, "portions": 2},
                {
                    "new": {
                        "name": "Avocado smash",
                        "portions": 2,
                        "items": [
                            {"ingredient_id": avocado, "grams": 80},
                            {"ingredient_id": spinach, "grams": 20},
                        ],
                    },
                    "portions": 2,
                },
            ],
        },
        headers=auth,
    )
    assert split.status_code == 200, split.text
    meal = split.json()
    assert meal["ingredients"] == []
    assert [c["name"] for c in meal["components"]] == [
        "Healthy banana pancakes",
        "Avocado smash",
    ]
    assert meal["per_portion"]["kcal"] == round(PANCAKE_KCAL + AVOCADO_KCAL + 4.6, 1)
    smash = meal["components"][1]["id"]
    assert [j["args"]["meal_id"] for j in queue.jobs.values()][-1] == smash

    # Taking every dish and ingredient away isn't allowed
    empty = await client.patch(url, json={"items": [], "components": []}, headers=auth)
    assert empty.status_code == 422
    # Removing a dish keeps it as a meal of ours
    gone = await client.patch(
        url, json={"components": [{"meal_id": smash, "portions": 2}]}, headers=auth
    )
    assert [c["name"] for c in gone.json()["components"]] == ["Avocado smash"]
    assert (await get(client, auth, pancakes))["used_in"] == []


async def test_deleting_a_dish_moves_its_ingredients_into_the_plates(client, auth, seeded, queue):
    plate = await post(client, auth, await pancake_plate(seeded))
    pancakes = plate["components"][0]["id"]
    response = await client.delete(f"/api/meals/{pancakes}", headers=auth)
    assert response.status_code == 204, response.text

    after = await get(client, auth, plate["id"])
    assert after["components"] == []
    assert {i["ingredient"]["name"]: i["grams"] for i in after["ingredients"]} == {
        "Avocado": 160,
        "Banana": 200,
        "Milk": 200,
        "Rolled oats": 100,
        "Eggs": 100,
    }
    assert after["per_portion"]["kcal"] == PANCAKE_KCAL + AVOCADO_KCAL
    [log] = await logs(seeded)
    assert log.kcal == PANCAKE_KCAL + AVOCADO_KCAL

    # Deleting the plate keeps its dishes
    second = await post(client, auth, await pancake_plate(seeded))
    dish = second["components"][0]["id"]
    assert (await client.delete(f"/api/meals/{second['id']}", headers=auth)).status_code == 204
    assert (await get(client, auth, dish))["used_in"] == []


async def test_undo_takes_back_the_new_dish(client, auth, seeded, queue):
    plate = await post(client, auth, await pancake_plate(seeded))
    dish = plate["components"][0]["id"]
    response = await client.post(f"/api/meals/{plate['id']}/undo", headers=auth)
    assert response.status_code == 200, response.text
    assert (await client.get(f"/api/meals/{dish}", headers=auth)).status_code == 404


async def test_undo_keeps_a_dish_used_since(client, auth, seeded, queue):
    plate = await post(client, auth, await pancake_plate(seeded))
    dish = plate["components"][0]["id"]
    await post(
        client,
        auth,
        await pancake_plate(seeded, name="Later", components=[{"meal_id": dish, "portions": 1}]),
    )
    response = await client.post(f"/api/meals/{plate['id']}/undo", headers=auth)
    assert response.status_code == 200, response.text
    assert (await get(client, auth, dish))["used_in"][0]["name"] == "Later"


async def test_undo_window_still_applies(client, auth, seeded, queue):
    plate = await post(client, auth, await pancake_plate(seeded))
    await seeded.execute(
        update(Meal)
        .where(Meal.id == plate["id"])
        .values(created_at=datetime.now(UTC) - timedelta(minutes=11))
    )
    await seeded.commit()
    assert (await client.post(f"/api/meals/{plate['id']}/undo", headers=auth)).status_code == 409


async def test_cookable_and_sources_count_the_dishes_ingredients(client, auth, seeded, queue):
    banana, oats, eggs, milk, avocado = await ingredient_ids(
        seeded, "Banana", "Rolled oats", "Eggs", "Milk", "Avocado"
    )
    plate = await post(client, auth, await pancake_plate(seeded))
    meal = await seeded.get(Meal, plate["id"])
    assert flat_recipe(meal) == pytest.approx(
        {avocado: 160, banana: 200, oats: 100, eggs: 100, milk: 200}
    )

    for iid in (banana, oats, eggs, milk):
        await add(client, auth, iid, grams=1000)
    cookable = (await client.get("/api/inventory/cookable", headers=auth)).json()
    assert [c["name"] for c in cookable] == ["Healthy banana pancakes"]  # no avocado at home
    await add(client, auth, avocado, grams=1000)
    cookable = (await client.get("/api/inventory/cookable?limit=5", headers=auth)).json()
    assert {c["name"] for c in cookable} == {"Healthy banana pancakes", "Pancakes with avocado"}

    me = (await client.get("/api/auth/me", headers=auth)).json()["id"]
    url = f"/api/insights/sources?end={TODAY.isoformat()}&days=1&user_id={me}"
    groups = (await client.get(url, headers=auth)).json()["groups"]
    eaten = {i["name"]: i["grams"] for g in groups.values() for i in g}
    # one plate = half of the 2-plate recipe: 100 g of the 200 g banana in it
    assert (eaten["Banana"], eaten["Avocado"]) == (100, 80)


async def test_the_weekly_shopping_list_buys_the_dishes_ingredients(
    client,
    auth,
    seeded,
    kitchen,  # noqa: F811 (the fixture imported above)
):
    smash = await make_meal(seeded, "Avocado smash", ["lunch"], 5, 2, {"Avocado": 200})
    seeded.add(MealComponent(meal_id=kitchen["toast"], component_id=smash, portions=2))
    await seeded.commit()
    other = await plan_partner(client, auth)
    await new_plan(client, auth, [[cook(15), {"mode": "out"}, {"mode": "skip"}] for _ in range(7)])
    await client.post("/api/plan/approve", headers=auth)
    assert (await client.post("/api/plan/approve", headers=other)).json()["status"] == "approved"

    shopping = (await client.get("/api/shopping", headers=auth)).json()
    need = {i["ingredient"]["name"]: i["need"] for i in shopping["items"]}
    # toast every morning: 7 batches of 2 portions, each with 2 of the smash's 2 portions
    assert need == {"Sourdough": 1120, "Eggs": 1400, "Avocado": 1400}
