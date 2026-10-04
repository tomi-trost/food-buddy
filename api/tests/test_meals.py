from datetime import date, timedelta

import pytest
from sqlalchemy import select

from app.analysis.models import AnalysisJob
from app.inventory.models import InventoryItem, RanOut
from app.logs.models import FoodLog
from app.meals.models import CookLog
from tests.conftest import ingredient_ids, jpeg_bytes, register

TODAY = date(2026, 10, 4)


async def body(session, **over):
    chicken, rice, oil = await ingredient_ids(
        session, "Chicken breast", "Rice (cooked)", "Olive oil"
    )
    data = {
        "name": "Chicken rice bowl",
        "meal_type": "lunch",
        "eaten_on": TODAY.isoformat(),
        "prep_minutes": 20,
        "portions": 2,
        "servings_eaten": 1,
        "cost": None,
        "items": [
            {"ingredient_id": chicken, "grams": 150},
            {"ingredient_id": rice, "grams": 200},
            {"ingredient_id": oil, "grams": 5},
        ],
        "used_up": [],
    }
    return data | over


async def stock(session, name, grams):
    (iid,) = await ingredient_ids(session, name)
    session.add(
        InventoryItem(
            household_id=1, ingredient_id=iid, grams=grams, expires_on=TODAY + timedelta(days=3)
        )
    )
    await session.commit()
    return iid


async def test_post_meal_scales_recipe_and_logs_what_was_eaten(client, auth, seeded, queue):
    response = await client.post("/api/meals", json=await body(seeded), headers=auth)
    assert response.status_code == 201, response.text
    meal = response.json()

    assert meal["types"] == ["lunch"]
    assert meal["emoji"] == "🍚"  # heaviest ingredient on the plate
    # plate × 2 portions made
    assert [(i["ingredient"]["name"], i["grams"]) for i in meal["ingredients"]] == [
        ("Rice (cooked)", 400),
        ("Chicken breast", 300),
        ("Olive oil", 10),
    ]
    # cost estimated from prices: 400×0.2 + 300×0.9 + 10×0.8 (per 100 g)
    assert meal["cost"] == round(0.8 + 2.7 + 0.08, 2)
    assert meal["cost_estimated"] is True
    # per portion = one plate: 247.5 + 260 + 44.2
    assert meal["per_portion"]["kcal"] == 551.7
    assert meal["steps"][0] == "Prep: wash and chop rice (cooked), chicken breast, olive oil."
    assert meal["steps_source"] == "template"
    assert [j["task_name"] for j in queue.jobs.values()] == ["generate_recipe"]

    log = (await seeded.scalars(select(FoodLog))).one()
    assert (log.meal_type, log.eaten_on, log.source, log.kind) == ("lunch", TODAY, "snap", "meal")
    assert log.kcal == 551.7
    cook = (await seeded.scalars(select(CookLog))).one()
    assert cook.cooked_on == TODAY


async def test_half_portion_eaten_halves_the_log(client, auth, seeded, queue):
    await client.post("/api/meals", json=await body(seeded, servings_eaten=0.5), headers=auth)
    log = (await seeded.scalars(select(FoodLog))).one()
    assert log.kcal == round(551.7 / 2, 1)


async def test_manual_cost_overrides_estimate(client, auth, seeded, queue):
    meal = (await client.post("/api/meals", json=await body(seeded, cost=6), headers=auth)).json()
    assert (meal["cost"], meal["cost_estimated"]) == (6, False)


async def test_stock_is_deducted_and_used_up_goes_to_shopping(client, auth, seeded, queue):
    chicken = await stock(seeded, "Chicken breast", 400)
    rice = await stock(seeded, "Rice (cooked)", 300)
    oil = await stock(seeded, "Olive oil", 500)

    payload = await body(seeded, used_up=[oil])
    assert (await client.post("/api/meals", json=payload, headers=auth)).status_code == 201

    seeded.expire_all()
    left = {i.ingredient_id: i.grams for i in await seeded.scalars(select(InventoryItem))}
    assert left == {chicken: 100}  # 400 − 300; rice 300 − 400 → gone; oil used up → gone
    ran_out = [r.ingredient_id for r in await seeded.scalars(select(RanOut))]
    assert ran_out == [oil]
    assert rice not in left


async def test_post_from_analysis_links_photo_and_blocks_double_post(client, auth, seeded, queue):
    files = {"photo": ("p.jpg", jpeg_bytes(), "image/jpeg")}
    job_id = (await client.post("/api/analyses", files=files, headers=auth)).json()["id"]

    first = await client.post(
        "/api/meals", json=await body(seeded, analysis_id=job_id), headers=auth
    )
    meal = first.json()
    assert meal["photo_url"] == f"/api/meals/{meal['id']}/photo"
    photo = await client.get(meal["photo_url"], headers=auth)
    assert photo.status_code == 200 and photo.headers["content-type"] == "image/jpeg"
    assert (await seeded.get(AnalysisJob, job_id)).meal_id == meal["id"]

    again = await client.post(
        "/api/meals", json=await body(seeded, analysis_id=job_id), headers=auth
    )
    assert again.status_code == 409


async def test_meal_without_photo_404s_photo(client, auth, seeded, queue):
    meal = (await client.post("/api/meals", json=await body(seeded), headers=auth)).json()
    assert meal["photo_url"] is None
    assert (await client.get(f"/api/meals/{meal['id']}/photo", headers=auth)).status_code == 404


async def test_other_household_cannot_use_analysis_or_see_meal(client, auth, seeded, queue):
    files = {"photo": ("p.jpg", jpeg_bytes(), "image/jpeg")}
    job_id = (await client.post("/api/analyses", files=files, headers=auth)).json()["id"]
    meal_id = (await client.post("/api/meals", json=await body(seeded), headers=auth)).json()["id"]

    stranger = await register(client, email="x@example.com", household_name="Other")
    stolen = await client.post(
        "/api/meals", json=await body(seeded, analysis_id=job_id), headers=stranger
    )
    assert stolen.status_code == 404
    assert (await client.get(f"/api/meals/{meal_id}", headers=stranger)).status_code == 404


@pytest.mark.parametrize(
    "over",
    [
        {"servings_eaten": 0.3},
        {"servings_eaten": 0},
        {"portions": 0},
        {"meal_type": "brunch"},
        {"items": []},
        {"used_up": [999]},
        {"name": ""},
    ],
)
async def test_validation(client, auth, seeded, over):
    response = await client.post("/api/meals", json=await body(seeded, **over), headers=auth)
    assert response.status_code == 422, over


async def test_duplicate_or_unknown_ingredients_rejected(client, auth, seeded):
    data = await body(seeded)
    dup = data | {"items": [data["items"][0], data["items"][0]]}
    assert (await client.post("/api/meals", json=dup, headers=auth)).status_code == 422
    unknown = data | {"items": [{"ingredient_id": 9999, "grams": 10}]}
    response = await client.post("/api/meals", json=unknown, headers=auth)
    assert response.status_code == 422
    assert "Unknown ingredients" in response.text
