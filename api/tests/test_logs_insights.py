from datetime import date, timedelta

from app.logs.models import FoodLog
from tests.conftest import register
from tests.test_meals import TODAY, body


def snack(user_id, day, kind, sugar, kcal, reward=False):
    return FoodLog(
        household_id=1,
        user_id=user_id,
        eaten_on=day,
        meal_type="snack",
        name="x",
        source="list",
        kind="snack",
        snack_kind=kind,
        is_reward=reward,
        sugar=sugar,
        kcal=kcal,
    )


async def test_day_lists_entries_and_totals(client, auth, seeded, queue):
    await client.post("/api/meals", json=await body(seeded), headers=auth)
    seeded.add(snack(1, TODAY, "sweet", 10, 140))
    seeded.add(snack(1, TODAY - timedelta(days=1), "sweet", 99, 999))  # other day
    await seeded.commit()

    day = (await client.get(f"/api/day?date={TODAY.isoformat()}", headers=auth)).json()
    assert [(e["meal_type"], e["kind"]) for e in day["entries"]] == [
        ("lunch", "meal"),
        ("snack", "snack"),
    ]
    assert day["totals"]["kcal"] == round(551.7 + 140, 1)
    assert day["totals"]["sugar"] == 10


async def test_insights_zero_fill_per_member_and_treats(client, auth, seeded, queue):
    code = (await client.get("/api/auth/me", headers=auth)).json()["household"]["invite_code"]
    partner = await register(client, email="p@example.com", name="Partner", invite_code=code)
    await client.post("/api/meals", json=await body(seeded), headers=auth)
    seeded.add(snack(1, TODAY, "sweet", 10, 140))
    seeded.add(snack(1, TODAY, "savory", 1, 200))  # not a treat
    seeded.add(snack(1, TODAY, "sweet", 6, 230, reward=True))  # croissant reward: not a treat
    seeded.add(snack(2, TODAY - timedelta(days=2), "drink", 35, 140))
    seeded.add(snack(2, TODAY - timedelta(days=30), "drink", 35, 140))  # out of range
    await seeded.commit()

    data = (
        await client.get(f"/api/insights?end={TODAY.isoformat()}&days=7", headers=partner)
    ).json()
    me, other = data["members"]
    assert (me["name"], other["name"]) == ("Tomi", "Partner")
    assert me["goals"]["fiber"] == 30
    assert (me["meals_rated"], other["meals_rated"]) == (0, 0)
    assert [d["date"] for d in me["days"]] == [
        (TODAY - timedelta(days=6 - i)).isoformat() for i in range(7)
    ]
    today = me["days"][-1]
    assert today["kcal"] == round(551.7 + 140 + 200 + 230, 1)
    assert (today["treats"], today["treat_sugar"]) == (1, 10)
    assert me["days"][0]["kcal"] == 0
    assert (other["days"][4]["treats"], other["days"][4]["treat_sugar"]) == (1, 35)
    assert sum(d["treats"] for d in other["days"]) == 1


async def test_insights_is_household_scoped_and_validated(client, auth, seeded, queue):
    await client.post("/api/meals", json=await body(seeded), headers=auth)
    stranger = await register(client, email="x@example.com", household_name="Other")
    data = (await client.get(f"/api/insights?end={TODAY.isoformat()}", headers=stranger)).json()
    assert [m["name"] for m in data["members"]] == ["Tomi"]
    assert all(d["kcal"] == 0 for d in data["members"][0]["days"])
    bad = await client.get(f"/api/insights?end={TODAY.isoformat()}&days=0", headers=auth)
    assert bad.status_code == 422
    assert (await client.get("/api/day", headers=auth)).status_code == 422
    assert (await client.get(f"/api/day?date={date(2026, 1, 1)}", headers=auth)).json()[
        "entries"
    ] == []


async def test_insights_count_meals_rated_per_member(client, auth, seeded, queue):
    meal = (await client.post("/api/meals", json=await body(seeded), headers=auth)).json()
    rating = {"taste": 4, "again": 5, "effort": 5, "fill": "right"}
    await client.put(f"/api/meals/{meal['id']}/rating", json=rating, headers=auth)
    data = (await client.get(f"/api/insights?end={TODAY.isoformat()}", headers=auth)).json()
    assert data["members"][0]["meals_rated"] == 1
