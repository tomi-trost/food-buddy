"""Changing or removing what I ate: portions of a meal, amount and values of a snack."""

import pytest
from sqlalchemy import func, select

from app.logs.models import FoodLog
from app.meals.models import CookLog
from tests.conftest import register
from tests.test_meals import TODAY, body
from tests.test_snacks import COOKIE, snack

CALCULATED_KCAL = 551.7  # one portion of the test meal


async def day(client, auth) -> dict:
    return (await client.get(f"/api/day?date={TODAY.isoformat()}", headers=auth)).json()


async def logged_meal(client, auth, session) -> tuple[int, int]:
    meal = (await client.post("/api/meals", json=await body(session), headers=auth)).json()
    entry = (await day(client, auth))["entries"][0]
    return meal["id"], entry["id"]


async def test_day_entries_carry_time_and_amounts(client, auth, seeded, queue):
    await logged_meal(client, auth, seeded)
    await client.post("/api/snacks", json=snack(amount=2), headers=auth)
    meal, cookie = (await day(client, auth))["entries"]
    assert meal["logged_at"] and cookie["logged_at"]
    assert (meal["servings"], meal["per"], meal["per_unit"]) == (1, None, None)
    assert (cookie["servings"], cookie["per"], cookie["per_unit"]) == (2, "piece", COOKIE)


async def test_snacks_count_in_the_day_totals(client, auth, seeded, queue):
    await logged_meal(client, auth, seeded)
    await client.post("/api/snacks", json=snack(), headers=auth)
    assert (await day(client, auth))["totals"]["kcal"] == round(CALCULATED_KCAL + 140, 1)


async def test_change_portions_of_a_meal_and_which_meal_it_was(client, auth, seeded, queue):
    _, entry = await logged_meal(client, auth, seeded)
    response = await client.patch(
        f"/api/log/{entry}", json={"servings": 1.5, "meal_type": "dinner"}, headers=auth
    )
    assert response.status_code == 200, response.text
    out = response.json()
    assert (out["servings"], out["meal_type"]) == (1.5, "dinner")
    assert out["nutrients"]["kcal"] == round(CALCULATED_KCAL * 1.5, 1)
    assert (await day(client, auth))["totals"]["kcal"] == round(CALCULATED_KCAL * 1.5, 1)


@pytest.mark.parametrize(
    "patch",
    [
        {"servings": 0.3},
        {"servings": 11},
        {"servings": 0},
        {"per_unit": COOKIE},
        {"meal_type": "x"},
    ],
)
async def test_bad_meal_entry_edits(client, auth, seeded, queue, patch):
    _, entry = await logged_meal(client, auth, seeded)
    assert (await client.patch(f"/api/log/{entry}", json=patch, headers=auth)).status_code == 422


async def test_meal_entry_still_editable_after_its_meal_was_deleted(client, auth, seeded, queue):
    meal_id, entry = await logged_meal(client, auth, seeded)
    await client.delete(f"/api/meals/{meal_id}?keep_log=true", headers=auth)
    out = (await client.patch(f"/api/log/{entry}", json={"servings": 2}, headers=auth)).json()
    assert out["nutrients"]["kcal"] == round(CALCULATED_KCAL * 2, 1)


async def test_change_a_snack_amount_and_values(client, auth, session):
    cake = {"kcal": 350, "protein": 4, "carbs": 45, "fat": 17, "fiber": 1, "sugar": 30}
    await client.post("/api/snacks", json=snack(name="Cake slice", per_unit=cake), headers=auth)
    entry = (await day(client, auth))["entries"][0]["id"]

    # the slice only had 9 g sugar, and it was half a slice
    fixed = cake | {"sugar": 9}
    response = await client.patch(
        f"/api/log/{entry}", json={"servings": 0.5, "per_unit": fixed}, headers=auth
    )
    assert response.status_code == 200, response.text
    out = response.json()
    assert (out["servings"], out["per_unit"]["sugar"]) == (0.5, 9)
    assert (out["nutrients"]["kcal"], out["nutrients"]["sugar"]) == (175, 4.5)

    grams = snack(per="100g", amount=45, per_unit=cake)
    await client.post("/api/snacks", json=grams, headers=auth)
    bar = (await day(client, auth))["entries"][1]["id"]
    out = (await client.patch(f"/api/log/{bar}", json={"servings": 30}, headers=auth)).json()
    assert out["nutrients"]["kcal"] == 105  # 350 × 30 / 100


@pytest.mark.parametrize(
    "patch",
    [{"meal_type": "lunch"}, {"servings": 0}, {"per_unit": COOKIE | {"sugar": -1}}],
)
async def test_bad_snack_entry_edits(client, auth, patch):
    await client.post("/api/snacks", json=snack(), headers=auth)
    entry = (await day(client, auth))["entries"][0]["id"]
    assert (await client.patch(f"/api/log/{entry}", json=patch, headers=auth)).status_code == 422


async def test_remove_a_meal_from_today_keeps_it_in_the_library(client, auth, seeded, queue):
    meal_id, entry = await logged_meal(client, auth, seeded)
    response = await client.delete(f"/api/log/{entry}", headers=auth)
    assert response.status_code == 204
    today = await day(client, auth)
    assert today["entries"] == [] and today["totals"]["kcal"] == 0
    meal = (await client.get(f"/api/meals/{meal_id}", headers=auth)).json()
    assert meal["cooked_count"] == 0  # this cook didn't happen
    assert await seeded.scalar(select(func.count()).select_from(CookLog)) == 0


async def test_remove_a_snack(client, auth, session):
    await client.post("/api/snacks", json=snack(), headers=auth)
    entry = (await day(client, auth))["entries"][0]["id"]
    assert (await client.delete(f"/api/log/{entry}", headers=auth)).status_code == 204
    assert await session.scalar(select(func.count()).select_from(FoodLog)) == 0
    assert (await client.delete(f"/api/log/{entry}", headers=auth)).status_code == 404


async def test_only_my_own_entries(client, auth, seeded, queue):
    _, entry = await logged_meal(client, auth, seeded)
    code = (await client.get("/api/auth/me", headers=auth)).json()["household"]["invite_code"]
    partner = await register(client, email="p@example.com", name="P", invite_code=code)
    assert (
        await client.patch(f"/api/log/{entry}", json={"servings": 2}, headers=partner)
    ).status_code == 404
    assert (await client.delete(f"/api/log/{entry}", headers=partner)).status_code == 404
    assert (await client.delete(f"/api/log/{entry}", headers={})).status_code == 401
    assert len((await day(client, auth))["entries"]) == 1
