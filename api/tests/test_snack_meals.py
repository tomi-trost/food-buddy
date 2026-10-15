"""Snacks are meals (0025): home-made snacks with ingredients, products as one-ingredient meals."""

from datetime import timedelta

import pytest
from sqlalchemy import func, select

from app.inventory.models import InventoryItem
from app.logs.models import FoodLog
from app.meals.models import CookLog, Meal
from app.nutrition.matching import match_ingredient
from app.nutrition.models import Ingredient
from app.plan.generator import Candidate, generate
from tests.conftest import ingredient_ids, register
from tests.test_analysis_queue import partner_of
from tests.test_meals import TODAY, stock
from tests.test_snacks import COOKIE, analyze, snack

pytestmark = pytest.mark.usefixtures("queue")

cook = {"mode": "cook", "minutes": 60}


async def pudding(client, auth, session, **over) -> dict:
    """Banana milk pudding: one jar is 200 g milk + 100 g banana, two jars made."""
    milk, banana = await ingredient_ids(session, "Milk", "Banana")
    body = {
        "name": "Banana pudding",
        "meal_type": "snack",
        "snack_kind": "sweet",
        "eaten_on": TODAY.isoformat(),
        "prep_minutes": 5,
        "portions": 2,
        "servings_eaten": 1,
        "items": [{"ingredient_id": milk, "grams": 200}, {"ingredient_id": banana, "grams": 100}],
    } | over
    response = await client.post("/api/meals", json=body, headers=auth)
    assert response.status_code == 201, response.text
    return response.json()


async def entries(session) -> list[FoodLog]:
    return list(await session.scalars(select(FoodLog).order_by(FoodLog.id)))


# --- home-made snacks ---------------------------------------------------------------------


async def test_home_made_snack_is_a_meal_logged_as_a_snack(client, auth, seeded):
    meal = await pudding(client, auth, seeded)
    assert (meal["types"], meal["snack_kind"], meal["per"], meal["is_product"]) == (
        ["snack"],
        "sweet",
        "portion",
        False,
    )
    assert meal["portion_g"] == 300
    assert meal["per_unit"]["kcal"] == meal["per_portion"]["kcal"] == 173  # 84 + 89

    [entry] = await entries(seeded)
    assert (entry.kind, entry.meal_type, entry.snack_kind, entry.per, entry.servings) == (
        "snack",
        "snack",
        "sweet",
        "portion",
        1,
    )
    assert entry.kcal == 173
    day = (await client.get(f"/api/day?date={TODAY}", headers=auth)).json()
    assert day["entries"][0]["meal_id"] == meal["id"]  # Today's list opens the snack


async def test_snack_counted_in_grams(client, auth, seeded):
    meal = await pudding(client, auth, seeded, per="100g")
    assert meal["per_unit"]["kcal"] == pytest.approx(57.67, abs=0.01)  # 173 kcal / 300 g
    [entry] = await entries(seeded)
    assert (entry.per, entry.servings, entry.kcal) == ("100g", 300, 173)  # one jar = 300 g

    again = {"meal_type": "snack", "eaten_on": TODAY.isoformat(), "amount": 150, "cooked": False}
    response = await client.post(f"/api/meals/{meal['id']}/cook", json=again, headers=auth)
    assert response.status_code == 200, response.text
    assert response.json()["cooked_count"] == 2  # every snack counts as eaten
    assert (await entries(seeded))[1].kcal == 86.5


async def test_snack_made_now_takes_the_recipe_already_made_does_not(client, auth, seeded):
    meal = await pudding(client, auth, seeded, eaten=False, eaten_on=None)
    await stock(seeded, "Milk", 1000)
    url = f"/api/meals/{meal['id']}/cook"
    made = {"meal_type": "snack", "eaten_on": TODAY.isoformat(), "cooked": True}
    assert (await client.post(url, json=made, headers=auth)).status_code == 200
    from_jar = made | {"cooked": False}
    assert (await client.post(url, json=from_jar, headers=auth)).status_code == 200
    milk = await seeded.scalar(select(InventoryItem.grams).execution_options(populate_existing=1))
    assert milk == 600  # the whole recipe (2 jars × 200 g) once


async def test_snack_validation(client, auth, seeded):
    milk, banana = await ingredient_ids(seeded, "Milk", "Banana")
    base = {
        "name": "x",
        "meal_type": "snack",
        "snack_kind": "sweet",
        "eaten_on": TODAY.isoformat(),
        "prep_minutes": 5,
        "portions": 1,
        "servings_eaten": 1,
        "items": [{"ingredient_id": milk, "grams": 200}],
    }
    bad = [
        base | {"snack_kind": None},  # a snack needs its type
        base | {"snack_kind": "candy"},
        base | {"per": "piece"},  # without the piece weight
        base | {"per": "100l"},
        base | {"meal_type": "lunch", "per": "100g"},  # only snacks are counted in g
    ]
    for body in bad:
        response = await client.post("/api/meals", json=body, headers=auth)
        assert response.status_code == 422, body


async def test_logging_a_meal_as_a_snack_needs_the_snack_type(client, auth, seeded):
    meal = await pudding(client, auth, seeded, meal_type="lunch", snack_kind=None)
    url = f"/api/meals/{meal['id']}/cook"
    body = {"meal_type": "snack", "eaten_on": TODAY.isoformat()}
    assert (await client.post(url, json=body, headers=auth)).status_code == 422
    amount = {"meal_type": "lunch", "eaten_on": TODAY.isoformat(), "amount": 100}
    assert (await client.post(url, json=amount, headers=auth)).status_code == 422


async def test_editing_a_snack_updates_days_logged_in_the_same_unit(client, auth, seeded):
    meal = await pudding(client, auth, seeded, per="100g")
    url = f"/api/meals/{meal['id']}"
    edited = await client.patch(url, json={"per": "piece", "piece_g": 150}, headers=auth)
    assert edited.status_code == 200, edited.text
    assert edited.json()["per_unit"]["kcal"] == 86.5  # half a jar
    [old] = await entries(seeded)
    assert (old.per, old.kcal) == ("100g", 173)  # logged in grams: stays as logged

    await client.patch(url, json={"per": "100g"}, headers=auth)
    per_portion = {"kcal": 300, "protein": 9, "carbs": 30, "fat": 15, "fiber": 6, "sugar": 20}
    await client.patch(url, json={"per_portion": per_portion}, headers=auth)
    await seeded.refresh(old)
    assert old.kcal == 300  # 300 g = one jar of our values
    assert old.per_unit["kcal"] == 100

    for body in ({"per": "piece"}, {"per": "100g", "piece_g": 10}):
        assert (await client.patch(url, json=body, headers=auth)).status_code == 422, body
    # no longer a snack: logged in portions again
    patched = await client.patch(url, json={"types": ["breakfast"]}, headers=auth)
    assert (patched.json()["per"], patched.json()["snack_kind"]) == ("portion", None)
    added = await client.patch(url, json={"types": ["breakfast", "snack"]}, headers=auth)
    assert added.json()["snack_kind"] == "savory"  # a type to start with; changed in Edit
    assert added.json()["types"] == ["breakfast", "snack"]


def test_snacks_never_land_in_the_weekly_plan():
    best_snack = Candidate(9, ("snack",), 1, 1, 5.0, ("prep-friendly",))
    week = generate([best_snack], [[cook, cook, cook]])
    assert [s.meal_id for s in week.days[0].values()] == [None, None, None]


# --- products --------------------------------------------------------------------------


async def test_saving_a_label_snack_makes_a_product_meal_with_its_photo(client, auth, session):
    per100 = {"kcal": 448, "protein": 16, "carbs": 54, "fat": 17, "fiber": 7.6, "sugar": 17}
    answer = {"name": "Biscotti", "kind": "sweet", "values_per_grams": 100, "values_unit": "g",
              "values": per100}  # fmt: skip
    job, _ = await analyze(client, auth, session, "label", answer)
    body = snack(name="Biscotti", per="100g", amount=45, per_unit=per100, source="label")
    logged = await client.post(
        "/api/snacks", json=body | {"analysis_id": job["id"], "save": True}, headers=auth
    )
    assert logged.status_code == 201, logged.text
    meal_id = logged.json()["meal_id"]

    meal = (await client.get(f"/api/meals/{meal_id}", headers=auth)).json()
    assert (meal["name"], meal["types"], meal["is_product"], meal["per"]) == (
        "Biscotti",
        ["snack"],
        True,
        "100g",
    )
    assert meal["per_unit"] == {k: float(v) for k, v in per100.items()}
    assert [(i["ingredient"]["name"], i["grams"]) for i in meal["ingredients"]] == [
        ("Biscotti", 45)
    ]
    assert meal["steps"] == [] and meal["cooked_count"] == 1
    photo = await client.get(meal["photo_url"], headers=auth)
    assert photo.status_code == 200 and photo.content[:2] == b"\xff\xd8"
    [card] = [c for c in (await client.get("/api/meals", headers=auth)).json()]
    assert (card["is_product"], card["snack_kind"]) == (True, "sweet")


async def test_a_piece_without_weight_gets_one_and_keeps_its_values(client, auth, session):
    logged = await client.post("/api/snacks", json=snack(save=True), headers=auth)
    meal = (await client.get(f"/api/meals/{logged.json()['meal_id']}", headers=auth)).json()
    assert (meal["per"], meal["piece_g"]) == ("piece", 30)
    assert meal["per_unit"]["kcal"] == 140  # one cookie, as logged
    assert meal["ingredients"][0]["ingredient"]["unit"] == "pc"  # the fridge counts pieces


async def test_saving_the_same_name_again_updates_the_product(client, auth, session):
    first = await client.post("/api/snacks", json=snack(save=True), headers=auth)
    later = (TODAY + timedelta(days=1)).isoformat()
    bigger = COOKIE | {"kcal": 200}
    body = snack(name=" cookie ", per_unit=bigger, eaten_on=later, save=True)
    second = await client.post("/api/snacks", json=body, headers=auth)
    assert second.json()["meal_id"] == first.json()["meal_id"]
    meals = (await client.get("/api/meals", headers=auth)).json()
    assert [(m["name"], m["per_unit"]["kcal"], m["cooked_count"]) for m in meals] == [
        ("cookie", 200, 2)
    ]


async def test_not_saving_is_the_default(client, auth, session):
    response = await client.post("/api/snacks", json=snack(), headers=auth)
    assert response.json()["meal_id"] is None
    assert (await client.get("/api/meals", headers=auth)).json() == []


async def test_logging_a_product_again_takes_it_from_stock(client, auth, session):
    meal_id = (await client.post("/api/snacks", json=snack(save=True), headers=auth)).json()[
        "meal_id"
    ]
    cookie = (await session.scalars(select(Ingredient).where(Ingredient.household_id == 1))).one()
    session.add(InventoryItem(household_id=1, ingredient_id=cookie.id, grams=300, expires_on=TODAY))
    await session.commit()

    body = {"meal_type": "snack", "eaten_on": TODAY.isoformat(), "amount": 2}
    response = await client.post(f"/api/meals/{meal_id}/cook", json=body, headers=auth)
    assert response.status_code == 200, response.text
    left = await session.scalar(
        select(InventoryItem.grams).execution_options(populate_existing=True)
    )
    assert left == 240  # 2 cookies × 30 g
    entry = (await entries(session))[-1]
    assert (entry.kind, entry.per, entry.servings, entry.kcal) == ("snack", "piece", 2, 280)
    assert entry.source == "cook"

    # logged again through the snack screen: it's ours, so stock goes down too
    await client.post("/api/snacks", json=snack(save=True), headers=auth)
    left = await session.scalar(
        select(InventoryItem.grams).execution_options(populate_existing=True)
    )
    assert left == 210


async def test_product_values_unit_and_turning_into_a_recipe(client, auth, seeded):
    meal_id = (await client.post("/api/snacks", json=snack(save=True), headers=auth)).json()[
        "meal_id"
    ]
    url = f"/api/meals/{meal_id}"
    pack = COOKIE | {"kcal": 500}
    response = await client.patch(url, json={"product_per100": pack, "per": "100g"}, headers=auth)
    assert response.status_code == 200, response.text
    assert (response.json()["per"], response.json()["per_unit"]["kcal"]) == ("100g", 500)
    assert response.json()["ingredients"][0]["ingredient"]["unit"] == "g"

    (milk,) = await ingredient_ids(seeded, "Milk")
    own = response.json()["ingredients"][0]["ingredient"]["id"]
    items = [{"ingredient_id": own, "grams": 30}, {"ingredient_id": milk, "grams": 200}]
    recipe = (await client.patch(url, json={"items": items}, headers=auth)).json()
    assert recipe["is_product"] is False  # a recipe now: cookies with milk
    again = await client.patch(url, json={"product_per100": pack}, headers=auth)
    assert again.status_code == 422


async def test_a_meal_has_no_pack_values(client, auth, seeded):
    meal = await pudding(client, auth, seeded)
    response = await client.patch(
        f"/api/meals/{meal['id']}", json={"product_per100": COOKIE}, headers=auth
    )
    assert response.status_code == 422


async def test_our_products_stay_ours(client, auth, session):
    meal_id = (await client.post("/api/snacks", json=snack(save=True), headers=auth)).json()[
        "meal_id"
    ]
    partner = await partner_of(client, auth)
    stranger = await register(client, "eve@example.com", "Eve")

    found = (await client.get("/api/ingredients?q=cookie", headers=auth)).json()
    assert [i["name"] for i in found][:1] == ["Cookie"]
    assert [
        i["name"] for i in (await client.get("/api/ingredients?q=cookie", headers=partner)).json()
    ][:1] == ["Cookie"]  # noqa: E501
    others = (await client.get("/api/ingredients?q=cookie", headers=stranger)).json()
    assert "Cookie" not in [i["name"] for i in others]
    assert (await client.get(f"/api/meals/{meal_id}", headers=stranger)).status_code == 404
    assert await match_ingredient(session, "cookie") is None  # never the model's match


async def test_scanned_and_saved_product_is_linked_to_its_barcode(client, auth, session):
    code = "8000500310427"
    per100 = {"kcal": 539, "protein": 6.3, "carbs": 57.5, "fat": 30.9, "fiber": 0, "sugar": 56.3}
    scan = snack(name="Nutella", per="100g", amount=15, per_unit=per100, source="barcode")
    body = scan | {"barcode": code, "save": True}
    meal_id = (await client.post("/api/snacks", json=body, headers=auth)).json()["meal_id"]
    known = (await client.get(f"/api/barcode/{code}", headers=auth)).json()
    assert (known["remembered"], known["meal_id"]) == (True, meal_id)

    # scanned again without the switch: still ours, the product follows
    again = scan | {"barcode": code, "amount": 20}
    assert (await client.post("/api/snacks", json=again, headers=auth)).json()["meal_id"] == meal_id
    meal = (await client.get(f"/api/meals/{meal_id}", headers=auth)).json()
    assert meal["ingredients"][0]["grams"] == 20  # the usual amount
    assert meal["cooked_count"] == 2


async def test_linked_entry_values_are_edited_on_the_snack(client, auth, session):
    await client.post("/api/snacks", json=snack(save=True), headers=auth)
    [entry] = await entries(session)
    url = f"/api/log/{entry.id}"
    bad = await client.patch(url, json={"per_unit": COOKIE | {"kcal": 1}}, headers=auth)
    assert bad.status_code == 422
    ok = await client.patch(url, json={"servings": 3}, headers=auth)
    assert ok.status_code == 200 and ok.json()["nutrients"]["kcal"] == 420


async def test_deleting_a_product_keeps_past_days_if_asked(client, auth, session):
    meal_id = (await client.post("/api/snacks", json=snack(save=True), headers=auth)).json()[
        "meal_id"
    ]
    response = await client.delete(f"/api/meals/{meal_id}?keep_log=true", headers=auth)
    assert response.status_code == 204
    assert len(await entries(session)) == 1
    assert await session.scalar(select(func.count()).select_from(Meal)) == 0


# --- shared ----------------------------------------------------------------------------


async def test_partner_gets_you_too_for_a_snack_and_it_logs_as_a_snack(client, auth, seeded):
    partner = await partner_of(client, auth)
    meal = await pudding(client, auth, seeded, per="100g")
    [suggestion] = (
        await client.get(f"/api/suggestions?today={TODAY.isoformat()}", headers=partner)
    ).json()
    accepted = await client.post(
        f"/api/suggestions/{suggestion['id']}/accept", json={"servings_eaten": 0.5}, headers=partner
    )
    assert accepted.status_code == 200, accepted.text
    entry = (await entries(seeded))[-1]
    assert (entry.meal_id, entry.kind, entry.per, entry.servings, entry.kcal) == (
        meal["id"],
        "snack",
        "100g",
        150,  # half a jar
        86.5,
    )


async def test_snacks_are_rated_like_meals(client, auth, seeded):
    meal = await pudding(client, auth, seeded)
    rating = {"taste": 4.5, "again": 5, "effort": 5}
    response = await client.put(f"/api/meals/{meal['id']}/rating", json=rating, headers=auth)
    assert response.status_code == 200 and response.json()["score"] is not None


async def test_snack_photos_are_analyzed_as_meals_with_the_snack_hint(client, auth, session):
    from tests.conftest import jpeg_bytes

    files = {"photo": ("p.jpg", jpeg_bytes(), "image/jpeg")}
    data = {"kind": "meal", "meal_type": "snack"}
    job = await client.post("/api/analyses", files=files, data=data, headers=auth)
    assert job.status_code == 202, job.text
    assert job.json()["meal_type"] == "snack"
    typed = await client.post(
        "/api/analyses/text", json={"text": "chia pudding", "meal_type": "snack"}, headers=auth
    )
    assert typed.status_code == 202 and typed.json()["meal_type"] == "snack"


async def test_cook_logs_count_each_snack(client, auth, seeded):
    meal = await pudding(client, auth, seeded)
    count = await seeded.scalar(
        select(func.count()).select_from(CookLog).where(CookLog.meal_id == meal["id"])
    )
    assert count == 1
