"""Insights: meals counted per type, and where each nutrient comes from."""

from types import SimpleNamespace

from app.logs.sources import groups_of
from tests.conftest import register
from tests.test_analysis_queue import partner_of
from tests.test_meals import TODAY, body
from tests.test_snack_meals import pudding


def food(**per100) -> SimpleNamespace:
    return SimpleNamespace(
        **({"protein": 0, "carbs": 0, "fat": 0, "fiber": 0, "sugar": 0} | per100)
    )


def test_ingredients_sit_under_the_macro_that_gives_most_energy():
    assert groups_of(food(protein=31, fat=3.6)) == ["protein"]  # chicken
    assert groups_of(food(protein=2.7, carbs=28)) == ["carbs"]  # rice
    assert groups_of(food(fat=100)) == ["fat"]  # oil
    assert groups_of(food(protein=1, carbs=23, sugar=12)) == ["sugar"]  # banana: mostly sugar
    assert groups_of(food(protein=17, carbs=42, fat=31, fiber=34)) == ["fat", "fiber"]  # chia
    assert groups_of(food()) == []  # water, salt


async def test_sources_rank_by_how_often_and_count_what_was_eaten(client, auth, seeded, queue):
    # the bowl twice (one plate each, 2 portions made), then a pudding snack
    for day in ("2026-10-03", TODAY.isoformat()):
        meal = await body(seeded, eaten_on=day)
        assert (await client.post("/api/meals", json=meal, headers=auth)).status_code == 201
    await pudding(client, auth, seeded)  # one jar: 200 g milk + 100 g banana
    me = (await client.get("/api/auth/me", headers=auth)).json()["id"]

    url = f"/api/insights/sources?end={TODAY.isoformat()}&days=7&user_id={me}"
    groups = (await client.get(url, headers=auth)).json()["groups"]
    assert set(groups) == {"protein", "carbs", "fat", "fiber", "sugar"}
    assert groups["protein"][0] == {
        "name": "Chicken breast",
        "emoji": groups["protein"][0]["emoji"],
        "times": 2,
        "grams": 300,
    }
    assert [(i["name"], i["times"], i["grams"]) for i in groups["carbs"]][0] == (
        "Rice (cooked)",
        2,
        400,
    )
    assert [i["name"] for i in groups["fat"]] == ["Olive oil"]
    eaten = {i["name"]: i["grams"] for g in groups.values() for i in g}
    assert eaten["Banana"] == 100 and eaten["Milk"] == 200

    one_day = f"/api/insights/sources?end={TODAY.isoformat()}&days=1&user_id={me}"
    today = (await client.get(one_day, headers=auth)).json()["groups"]
    assert today["protein"][0]["times"] == 1


async def test_meal_counts_per_type_over_the_range(client, auth, seeded, queue):
    await client.post("/api/meals", json=await body(seeded), headers=auth)
    await client.post("/api/meals", json=await body(seeded, meal_type="breakfast"), headers=auth)
    await client.post(
        "/api/meals", json=await body(seeded, eaten_on="2026-09-01"), headers=auth
    )  # too old
    await pudding(client, auth, seeded)
    data = (await client.get(f"/api/insights?end={TODAY.isoformat()}", headers=auth)).json()
    assert data["members"][0]["meal_counts"] == {
        "breakfast": 1,
        "lunch": 1,
        "dinner": 0,
        "snack": 1,
    }


async def test_sources_only_for_my_household(client, auth, seeded, queue):
    partner = await partner_of(client, auth)
    partner_id = (await client.get("/api/auth/me", headers=partner)).json()["id"]
    ok = await client.get(
        f"/api/insights/sources?end={TODAY.isoformat()}&user_id={partner_id}", headers=auth
    )
    assert ok.status_code == 200 and all(v == [] for v in ok.json()["groups"].values())

    stranger = await register(client, email="x@example.com", household_name="Other")
    nope = await client.get(
        f"/api/insights/sources?end={TODAY.isoformat()}&user_id={partner_id}", headers=stranger
    )
    assert nope.status_code == 404
    bad = await client.get(
        f"/api/insights/sources?end={TODAY.isoformat()}&user_id={partner_id}&days=0", headers=auth
    )
    assert bad.status_code == 422
