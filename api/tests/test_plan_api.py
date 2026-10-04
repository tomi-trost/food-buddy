from datetime import date, timedelta

import pytest
from sqlalchemy import select

from app.inventory.models import InventoryItem, RanOut
from app.meals.models import Meal, MealIngredient
from app.ratings.models import Rating
from tests.conftest import ingredient_ids, register

MONDAY = date(2026, 10, 5)
TODAY = date(2026, 10, 4)


def cook(m):
    return {"mode": "cook", "minutes": m}


def wizard(breakfast=None, lunch=None, dinner=None):
    row = [breakfast or cook(15), lunch or {"mode": "prep"}, dinner or cook(60)]
    return [list(row) for _ in range(7)]


async def make_meal(session, name, types, minutes, portions, items, tags=(), taste=None):
    ids = await ingredient_ids(session, *items)
    meal = Meal(
        household_id=1,
        name=name,
        types=list(types),
        tags=list(tags),
        prep_minutes=minutes,
        portions=portions,
        steps=[],
        ingredients=[
            MealIngredient(ingredient_id=i, grams=g)
            for i, g in zip(ids, items.values(), strict=True)
        ],
    )
    session.add(meal)
    await session.flush()
    if taste is not None:
        session.add(
            Rating(meal_id=meal.id, user_id=1, taste=taste, again=5, effort=5, fill="right")
        )
    await session.commit()
    return meal.id


@pytest.fixture
async def kitchen(client, auth, seeded):
    """Toast (bfast), Bowl (lunch, prep-friendly), Stir-fry & Curry (dinner)."""
    toast = await make_meal(
        seeded, "Toast", ["breakfast"], 10, 2, {"Sourdough": 160, "Eggs": 200}, taste=5
    )
    bowl = await make_meal(
        seeded,
        "Bowl",
        ["lunch"],
        20,
        2,
        {"Chicken breast": 200, "Rice (cooked)": 300},
        tags=["prep-friendly"],
        taste=4,
    )
    stirfry = await make_meal(
        seeded, "Stir-fry", ["dinner"], 25, 2, {"Chicken breast": 300}, taste=5
    )
    curry = await make_meal(
        seeded, "Curry", ["dinner", "lunch"], 30, 4, {"Chickpeas": 400}, taste=3
    )
    return {"toast": toast, "bowl": bowl, "stirfry": stirfry, "curry": curry}


async def new_plan(client, headers, w=None):
    response = await client.post(
        "/api/plan",
        json={"week_start": MONDAY.isoformat(), "wizard": w or wizard()},
        headers=headers,
    )
    assert response.status_code == 201, response.text
    return response.json()


async def partner(client, owner):
    code = (await client.get("/api/auth/me", headers=owner)).json()["household"]["invite_code"]
    return await register(client, email="p@example.com", name="Partner", invite_code=code)


def slot(plan, day, meal_type):
    return next(s for s in plan["days"][day]["slots"] if s["meal_type"] == meal_type)


async def test_no_plan_yet(client, auth):
    assert (await client.get("/api/plan", headers=auth)).json() is None


async def test_generate_week_summary_and_kcal(client, auth, kitchen):
    plan = await new_plan(client, auth)
    assert plan["status"] == "draft"
    assert plan["days"][0]["date"] == MONDAY.isoformat()
    assert slot(plan, 0, "breakfast")["meal"]["name"] == "Toast"
    assert slot(plan, 0, "lunch")["meal"]["name"] == "Bowl"
    dinners = [slot(plan, d, "dinner")["meal"]["name"] for d in range(4)]
    assert dinners == ["Stir-fry", "Curry", "Stir-fry", "Stir-fry"]  # no repeat until exhausted
    s = plan["summary"]
    assert (s["cook"], s["prep"], s["out"], s["skip"]) == (14, 7, 0, 0)
    # bowl: 7 slots × 2 people = 14 portions / 2 per batch → cook it 7 times
    assert s["batch_cook"] == [{"meal_id": kitchen["bowl"], "name": "Bowl", "times": 7}]
    assert plan["days"][0]["kcal"] > 0


async def test_wizard_validation(client, auth, kitchen):
    tuesday = {"week_start": (MONDAY + timedelta(days=1)).isoformat(), "wizard": wizard()}
    assert (await client.post("/api/plan", json=tuesday, headers=auth)).status_code == 422
    short = {"week_start": MONDAY.isoformat(), "wizard": wizard()[:6]}
    assert (await client.post("/api/plan", json=short, headers=auth)).status_code == 422
    no_minutes = {"week_start": MONDAY.isoformat(), "wizard": wizard(dinner={"mode": "cook"})}
    assert (await client.post("/api/plan", json=no_minutes, headers=auth)).status_code == 422


async def test_slot_changes_reset_approval_and_check_meal_type(client, auth, kitchen):
    other = await partner(client, auth)
    await new_plan(client, auth)
    approved = (await client.post("/api/plan/approve", headers=auth)).json()
    assert approved["status"] == "draft"
    assert [a["approved"] for a in approved["approvals"]] == [True, False]

    out = await client.put("/api/plan/slots/2/dinner", json={"mode": "out"}, headers=other)
    plan = out.json()
    assert slot(plan, 2, "dinner") == {
        "meal_type": "dinner",
        "mode": "out",
        "minutes": None,
        "meal": None,
    }
    assert [a["approved"] for a in plan["approvals"]] == [False, False]

    back = (
        await client.put("/api/plan/slots/2/dinner", json={"mode": "cook"}, headers=auth)
    ).json()
    assert slot(back, 2, "dinner")["minutes"] == 90  # hand-picked slots get a generous budget
    assert slot(back, 2, "dinner")["meal"]["name"] == "Stir-fry"

    wrong = await client.put(
        "/api/plan/slots/0/breakfast",
        json={"mode": "cook", "meal_id": kitchen["curry"]},
        headers=auth,
    )
    assert wrong.status_code == 422
    put = await client.put(
        "/api/plan/slots/0/lunch", json={"mode": "cook", "meal_id": kitchen["curry"]}, headers=auth
    )
    assert slot(put.json(), 0, "lunch")["meal"]["name"] == "Curry"
    bad_day = await client.put("/api/plan/slots/7/lunch", json={"mode": "out"}, headers=auth)
    assert bad_day.status_code == 422


async def test_slot_options(client, auth, kitchen):
    await new_plan(client, auth)
    dinner = (await client.get("/api/plan/slots/0/dinner/options", headers=auth)).json()
    assert [m["name"] for m in dinner] == ["Stir-fry", "Curry"]
    lunch = (await client.get("/api/plan/slots/0/lunch/options", headers=auth)).json()
    assert [m["name"] for m in lunch] == ["Bowl"]  # prep slot → prep-friendly only


async def test_both_approve_then_shopping_list(client, auth, seeded, kitchen):
    other = await partner(client, auth)
    w = [[cook(15), {"mode": "out"}, {"mode": "skip"}] for _ in range(7)]  # toast every morning
    await new_plan(client, auth, w)
    assert (await client.get("/api/shopping", headers=auth)).json()["items"] == []

    eggs, bread = await ingredient_ids(seeded, "Eggs", "Sourdough")
    seeded.add(InventoryItem(household_id=1, ingredient_id=eggs, grams=120, expires_on=TODAY))
    await seeded.commit()

    await client.post("/api/plan/approve", headers=auth)
    plan = (await client.post("/api/plan/approve", headers=other)).json()
    assert plan["status"] == "approved"

    shopping = (await client.get("/api/shopping", headers=auth)).json()
    assert shopping["plan_approved"] is True
    # 7 slots × 2 people = 14 portions / 2 → 7 batches: bread 1120 g, eggs 1400 g − 120 at home
    by_name = {i["ingredient"]["name"]: i for i in shopping["items"]}
    assert (by_name["Sourdough"]["need"], by_name["Sourdough"]["buy"]) == (1120, 1150)
    assert (by_name["Eggs"]["have"], by_name["Eggs"]["buy"]) == (120, 1300)
    assert shopping["total"] == pytest.approx(0.3 * 11.5 + 0.5 * 13)


async def test_ran_out_items_check_and_finish(client, auth, seeded, kitchen):
    oil, eggs = await ingredient_ids(seeded, "Olive oil", "Eggs")
    seeded.add(RanOut(household_id=1, ingredient_id=oil))
    await seeded.commit()

    shopping = (await client.get("/api/shopping", headers=auth)).json()
    assert [(i["ingredient"]["name"], i["buy"], i["ran_out"]) for i in shopping["items"]] == [
        ("Olive oil", 250, True)
    ]
    assert (
        await client.post("/api/shopping/finish", json={"today": TODAY.isoformat()}, headers=auth)
    ).status_code == 400

    checked = await client.put(f"/api/shopping/check/{oil}", json={"checked": True}, headers=auth)
    assert checked.json()["items"][0]["checked"] is True
    done = await client.post(
        "/api/shopping/finish", json={"today": TODAY.isoformat()}, headers=auth
    )
    assert done.json() == {"added": 1}

    seeded.expire_all()
    item = (await seeded.scalars(select(InventoryItem))).one()
    assert (item.ingredient_id, item.grams, item.expires_on) == (
        oil,
        250,
        TODAY + timedelta(days=300),
    )
    assert list(await seeded.scalars(select(RanOut))) == []
    assert (await client.get("/api/shopping", headers=auth)).json()["items"] == []


async def test_patch_meal_types_and_prep_friendly(client, auth, kitchen):
    meal_id = kitchen["stirfry"]
    response = await client.patch(
        f"/api/meals/{meal_id}",
        json={"types": ["dinner", "lunch"], "prep_friendly": True},
        headers=auth,
    )
    meal = response.json()
    assert meal["types"] == ["lunch", "dinner"]
    assert "prep-friendly" in meal["tags"]
    off = await client.patch(f"/api/meals/{meal_id}", json={"prep_friendly": False}, headers=auth)
    assert "prep-friendly" not in off.json()["tags"]
    empty = await client.patch(f"/api/meals/{meal_id}", json={"types": []}, headers=auth)
    assert empty.status_code == 422
