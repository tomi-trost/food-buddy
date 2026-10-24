"""Editing and deleting meals after they were posted; typed-in nutrition per portion."""

import pytest
from sqlalchemy import select

from app.inventory.models import InventoryItem
from app.logs.models import FoodLog
from tests.conftest import ingredient_ids, register
from tests.test_meals import TODAY, body, stock

# One plate: chicken 150 g (247.5 kcal) + rice 200 g (260) + oil 5 g (44.2) = 551.7 kcal
CALCULATED_KCAL = 551.7
TYPED = {"kcal": 700, "protein": 40, "carbs": 60, "fat": 25, "fiber": 6, "sugar": 3}


async def partner(client, owner):
    code = (await client.get("/api/auth/me", headers=owner)).json()["household"]["invite_code"]
    return await register(client, email="partner@example.com", name="Partner", invite_code=code)


async def post(client, auth, session, **over) -> dict:
    response = await client.post("/api/meals", json=await body(session, **over), headers=auth)
    assert response.status_code == 201, response.text
    return response.json()


async def patch(client, auth, meal_id, **fields):
    return await client.patch(f"/api/meals/{meal_id}", json=fields, headers=auth)


async def logs(session) -> list[FoodLog]:
    return list(
        await session.scalars(
            select(FoodLog).order_by(FoodLog.id).execution_options(populate_existing=True)
        )
    )


async def test_posting_with_typed_in_values_logs_those(client, auth, seeded, queue):
    meal = await post(client, auth, seeded, per_portion=TYPED, servings_eaten=1.5)
    assert meal["per_portion"]["kcal"] == 700
    assert meal["per_portion_calculated"]["kcal"] == CALCULATED_KCAL
    assert meal["nutrients_overridden"] is True
    [log] = await logs(seeded)
    assert (log.kcal, log.protein, log.servings) == (1050, 60, 1.5)


async def test_posting_without_typed_in_values_uses_ingredients(client, auth, seeded, queue):
    meal = await post(client, auth, seeded)
    assert meal["nutrients_overridden"] is False
    assert meal["per_portion"] == meal["per_portion_calculated"]
    assert meal["logged_count"] == 1


async def test_typed_in_values_are_validated(client, auth, seeded, queue):
    bad = await client.post(
        "/api/meals", json=await body(seeded, per_portion=TYPED | {"kcal": -1}), headers=auth
    )
    assert bad.status_code == 422
    missing = await client.post(
        "/api/meals", json=await body(seeded, per_portion={"kcal": 500}), headers=auth
    )
    assert missing.status_code == 422


async def test_override_and_reset_update_the_days_it_was_eaten(client, auth, seeded, queue):
    meal = await post(client, auth, seeded, servings_eaten=0.5)
    [log] = await logs(seeded)
    assert log.kcal == round(CALCULATED_KCAL / 2, 1)

    response = await patch(client, auth, meal["id"], per_portion=TYPED)
    assert response.status_code == 200, response.text
    assert response.json()["per_portion"]["kcal"] == 700
    [log] = await logs(seeded)
    assert (log.kcal, log.fat) == (350, 12.5)

    reset = (await patch(client, auth, meal["id"], per_portion=None)).json()
    assert reset["nutrients_overridden"] is False
    assert reset["per_portion"]["kcal"] == CALCULATED_KCAL
    [log] = await logs(seeded)
    assert log.kcal == round(CALCULATED_KCAL / 2, 1)


async def test_fields_not_sent_stay_as_they_are(client, auth, seeded, queue):
    meal = await post(client, auth, seeded, per_portion=TYPED, cost=12.5)
    edited = (await patch(client, auth, meal["id"], name="Chicken bowl")).json()
    assert edited["nutrients_overridden"] is True
    assert edited["cost"] == 12.5 and edited["cost_estimated"] is False


async def test_cost_can_go_back_to_the_estimate(client, auth, seeded, queue):
    meal = await post(client, auth, seeded, cost=12.5)
    edited = (await patch(client, auth, meal["id"], cost=None)).json()
    assert edited["cost_estimated"] is True


async def test_editing_ingredients_recalculates_and_renames_the_log(client, auth, seeded, queue):
    meal = await post(client, auth, seeded)  # 2 portions
    chicken, rice = await ingredient_ids(seeded, "Chicken breast", "Rice (cooked)")
    response = await patch(
        client,
        auth,
        meal["id"],
        name="Just chicken and rice",
        items=[{"ingredient_id": chicken, "grams": 200}, {"ingredient_id": rice, "grams": 600}],
    )
    assert response.status_code == 200, response.text
    edited = response.json()
    assert [(i["ingredient"]["name"], i["grams"]) for i in edited["ingredients"]] == [
        ("Rice (cooked)", 600),
        ("Chicken breast", 200),
    ]
    # (200 × 1.65 + 600 × 1.30) / 2 portions
    assert edited["per_portion"]["kcal"] == 555
    [log] = await logs(seeded)
    assert (log.name, log.kcal) == ("Just chicken and rice", 555)


async def test_more_portions_means_less_per_portion(client, auth, seeded, queue):
    meal = await post(client, auth, seeded)
    edited = (await patch(client, auth, meal["id"], portions=4)).json()
    assert edited["per_portion"]["kcal"] == round(CALCULATED_KCAL / 2, 1)
    [log] = await logs(seeded)
    assert log.kcal == round(CALCULATED_KCAL / 2, 1)


async def test_edits_leave_the_stock_alone(client, auth, seeded, queue):
    rice_id = await stock(seeded, "Rice (cooked)", 1000)
    meal = await post(client, auth, seeded)  # takes 400 g rice
    chicken, rice = await ingredient_ids(seeded, "Chicken breast", "Rice (cooked)")
    await patch(client, auth, meal["id"], items=[{"ingredient_id": rice, "grams": 50}])
    item = await seeded.scalar(
        select(InventoryItem)
        .where(InventoryItem.ingredient_id == rice_id)
        .execution_options(populate_existing=True)
    )
    assert item.grams == 600


@pytest.mark.parametrize(
    "items",
    [
        [],
        [{"ingredient_id": 999999, "grams": 100}],
        [{"ingredient_id": "same", "grams": 100}, {"ingredient_id": "same", "grams": 50}],
        [{"ingredient_id": "same", "grams": 0}],
    ],
)
async def test_bad_ingredient_edits_are_rejected(client, auth, seeded, queue, items):
    meal = await post(client, auth, seeded)
    (chicken,) = await ingredient_ids(seeded, "Chicken breast")
    items = [i | {"ingredient_id": chicken} if i["ingredient_id"] == "same" else i for i in items]
    response = await patch(client, auth, meal["id"], items=items)
    assert response.status_code == 422
    unchanged = (await client.get(f"/api/meals/{meal['id']}", headers=auth)).json()
    assert len(unchanged["ingredients"]) == 3


async def test_delete_removes_the_meal_and_its_log_entries(client, auth, seeded, queue):
    other = await partner(client, auth)
    meal = await post(client, auth, seeded)
    await client.post(
        f"/api/meals/{meal['id']}/cook",
        json={"meal_type": "dinner", "eaten_on": TODAY.isoformat()},
        headers=other,
    )
    await client.put(
        f"/api/meals/{meal['id']}/rating",
        json={"taste": 4, "again": 5, "effort": 3},
        headers=other,
    )
    assert (await client.get(f"/api/meals/{meal['id']}", headers=auth)).json()["logged_count"] == 2

    response = await client.delete(f"/api/meals/{meal['id']}", headers=other)  # either of us
    assert response.status_code == 204
    assert (await client.get(f"/api/meals/{meal['id']}", headers=auth)).status_code == 404
    assert await logs(seeded) == []
    assert (await client.get("/api/meals", headers=auth)).json() == []


async def test_delete_can_keep_the_food_log(client, auth, seeded, queue):
    meal = await post(client, auth, seeded)
    response = await client.delete(f"/api/meals/{meal['id']}?keep_log=true", headers=auth)
    assert response.status_code == 204
    [log] = await logs(seeded)
    assert (log.meal_id, log.name, log.kcal) == (None, "Chicken rice bowl", CALCULATED_KCAL)


async def test_other_households_cannot_edit_or_delete(client, auth, seeded, queue):
    meal = await post(client, auth, seeded)
    stranger = await register(client, email="x@example.com", name="X")
    assert (await patch(client, stranger, meal["id"], name="Mine")).status_code == 404
    assert (await client.delete(f"/api/meals/{meal['id']}", headers=stranger)).status_code == 404
    assert (await client.delete(f"/api/meals/{meal['id']}", headers={})).status_code == 401
    assert (await client.get(f"/api/meals/{meal['id']}", headers=auth)).status_code == 200


async def test_remove_my_rating_only(client, auth, seeded, queue):
    other = await partner(client, auth)
    meal = await post(client, auth, seeded)
    rating = {"taste": 4, "again": 5, "effort": 0}
    for headers in (auth, other):
        await client.put(f"/api/meals/{meal['id']}/rating", json=rating, headers=headers)

    response = await client.delete(f"/api/meals/{meal['id']}/rating", headers=auth)
    assert response.status_code == 200
    by_name = {r["name"]: r["rating"] for r in response.json()["ratings"]}
    assert by_name["Tomi"] is None and by_name["Partner"]["taste"] == 4
    # removing again is fine
    again = await client.delete(f"/api/meals/{meal['id']}/rating", headers=auth)
    assert again.status_code == 200
