from datetime import date, timedelta

import pytest
from sqlalchemy import select

from app.inventory.models import InventoryItem, RanOut
from app.logs.models import FoodLog
from tests.conftest import register
from tests.test_meals import TODAY, body, stock


async def post(client, headers, session, **over):
    response = await client.post("/api/meals", json=await body(session, **over), headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


async def partner_of(client, owner):
    code = (await client.get("/api/auth/me", headers=owner)).json()["household"]["invite_code"]
    return await register(client, email="partner@example.com", name="Partner", invite_code=code)


RATE = {"taste": 4.5, "again": 5, "effort": 3, "fill": "hungry"}


async def test_feed_lists_household_meals_with_stats(client, auth, seeded, queue):
    first = await post(client, auth, seeded, name="Bowl", prep_minutes=15)
    await post(client, auth, seeded, name="Second", meal_type="dinner")

    cards = (await client.get("/api/meals", headers=auth)).json()
    assert [c["name"] for c in cards] == ["Second", "Bowl"]  # newest first
    bowl = cards[1]
    assert bowl["id"] == first["id"]
    assert (bowl["cooked_count"], bowl["last_cooked"]) == (1, TODAY.isoformat())
    assert bowl["score"] is None and bowl["rated_by_me"] is False
    assert bowl["kcal_per_portion"] == 551.7
    assert "quick" in bowl["tags"] and "high-protein" in bowl["tags"]  # 15 min, 51.9 g protein

    stranger = await register(client, email="x@example.com", household_name="Other")
    assert (await client.get("/api/meals", headers=stranger)).json() == []


async def test_rating_upserts_and_scores_like_the_mock(client, auth, seeded, queue):
    meal = await post(client, auth, seeded)
    partner = await partner_of(client, auth)

    rated = (await client.put(f"/api/meals/{meal['id']}/rating", json=RATE, headers=auth)).json()
    assert rated["score"] == pytest.approx((4.5 + 5 + 3) / 3)
    by_name = {r["name"]: r["rating"] for r in rated["ratings"]}
    assert by_name["Tomi"] == RATE | {"note": None}
    assert by_name["Partner"] is None  # waiting for partner

    await client.put(
        f"/api/meals/{meal['id']}/rating",
        json={"taste": 2.5, "again": 1, "effort": 3, "fill": "right"},
        headers=partner,
    )
    # edit own rating: still one rating per person
    edited = {"taste": 5, "again": 5, "effort": 5, "fill": "right", "note": "best one"}
    detail = (await client.put(f"/api/meals/{meal['id']}/rating", json=edited, headers=auth)).json()
    assert detail["score"] == pytest.approx((5 + (2.5 + 1 + 3) / 3) / 2)
    assert {r["name"]: r["rating"]["taste"] for r in detail["ratings"]} == {
        "Tomi": 5,
        "Partner": 2.5,
    }

    card = (await client.get("/api/meals", headers=partner)).json()[0]
    assert card["rated_by_me"] is True
    assert card["score"] == pytest.approx(detail["score"])


@pytest.mark.parametrize(
    "bad",
    [
        {"taste": 4.3, "again": 5, "effort": 5},
        {"taste": 0, "again": 5, "effort": 5},
        {"taste": 5.5, "again": 5, "effort": 5},
        {"taste": 4, "again": 4, "effort": 5},
        {"taste": 4, "again": 5, "effort": 5, "fill": "stuffed"},
    ],
)
async def test_rating_validation(client, auth, seeded, queue, bad):
    meal = await post(client, auth, seeded)
    response = await client.put(f"/api/meals/{meal['id']}/rating", json=bad, headers=auth)
    assert response.status_code == 422


async def test_cannot_rate_or_cook_other_households_meal(client, auth, seeded, queue):
    meal = await post(client, auth, seeded)
    stranger = await register(client, email="x@example.com", household_name="Other")
    assert (
        await client.put(f"/api/meals/{meal['id']}/rating", json=RATE, headers=stranger)
    ).status_code == 404
    cook = {"meal_type": "dinner", "eaten_on": TODAY.isoformat()}
    assert (
        await client.post(f"/api/meals/{meal['id']}/cook", json=cook, headers=stranger)
    ).status_code == 404


async def test_cook_again_logs_one_portion_and_updates_stock(client, auth, seeded, queue):
    meal = await post(client, auth, seeded)
    rice = await stock(seeded, "Rice (cooked)", 1000)
    chicken = await stock(seeded, "Chicken breast", 500)
    later = TODAY + timedelta(days=2)

    response = await client.post(
        f"/api/meals/{meal['id']}/cook",
        json={"meal_type": "dinner", "eaten_on": later.isoformat(), "used_up": [chicken]},
        headers=auth,
    )
    detail = response.json()
    assert (detail["cooked_count"], detail["last_cooked"]) == (2, later.isoformat())

    logs = list(await seeded.scalars(select(FoodLog).order_by(FoodLog.id)))
    assert [(entry.source, entry.meal_type) for entry in logs] == [
        ("snap", "lunch"),
        ("cook", "dinner"),
    ]
    assert logs[1].kcal == 551.7  # one portion
    seeded.expire_all()
    stock_left = {i.ingredient_id: i.grams for i in await seeded.scalars(select(InventoryItem))}
    assert stock_left == {rice: 600}  # 1000 − 400; chicken used up
    assert [r.ingredient_id for r in await seeded.scalars(select(RanOut))] == [chicken]


async def test_cook_rejects_foreign_used_up(client, auth, seeded, queue):
    meal = await post(client, auth, seeded)
    response = await client.post(
        f"/api/meals/{meal['id']}/cook",
        json={"meal_type": "dinner", "eaten_on": date(2026, 10, 5).isoformat(), "used_up": [999]},
        headers=auth,
    )
    assert response.status_code == 422
