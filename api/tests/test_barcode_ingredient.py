"""A scanned pack as an ingredient to cook with: POST /api/barcode/{code}/ingredient."""

import pytest

from tests.conftest import CODE, register
from tests.test_meals import body

TORTILLA = {"kcal": 310, "protein": 8.5, "carbs": 52, "fat": 7, "fiber": 3, "sugar": 2.5}


async def add(client, auth, **over):
    payload = {"name": "Tortilla wraps (Mlinotest)", "per100": TORTILLA, "piece_g": 62} | over
    return await client.post(f"/api/barcode/{CODE}/ingredient", json=payload, headers=auth)


async def test_scanned_pack_becomes_our_ingredient_counted_in_pieces(client, auth, seeded, off):
    response = await add(client, auth)
    assert response.status_code == 200, response.text
    tortilla = response.json()
    assert tortilla["name"] == "Tortilla wraps (Mlinotest)"
    assert tortilla["per100"]["kcal"] == 310
    assert (tortilla["unit"], tortilla["unit_grams"]) == ("pc", 62)

    # our search finds it, and the barcode lookup knows we cook with it
    found = (await client.get("/api/ingredients?q=tortilla", headers=auth)).json()
    assert tortilla["id"] in [i["id"] for i in found]
    product = (await client.get(f"/api/barcode/{CODE}", headers=auth)).json()
    assert product["ingredient"] == tortilla

    # and a meal can use it like any ingredient
    items = [{"ingredient_id": tortilla["id"], "grams": 124}]
    meal = await client.post("/api/meals", json=await body(seeded, items=items), headers=auth)
    assert meal.status_code == 201, meal.text
    assert meal.json()["per_portion"]["kcal"] == pytest.approx(
        310 * 1.24, abs=1
    )  # items are one plate


async def test_scanning_again_updates_the_same_ingredient(client, auth, off):
    first = (await add(client, auth)).json()
    again = (await add(client, auth, name="Wraps", per100=TORTILLA | {"kcal": 300})).json()
    assert again["id"] == first["id"]
    assert (again["name"], again["per100"]["kcal"]) == ("Wraps", 300)
    weighed = (await add(client, auth, piece_g=None)).json()
    assert (weighed["unit"], weighed["unit_grams"]) == ("g", 1)
    drink = (await add(client, auth, per="100ml", piece_g=None)).json()
    assert drink["unit"] == "ml"


async def test_other_households_never_see_it(client, auth, off):
    tortilla = (await add(client, auth)).json()
    stranger = await register(client, email="x@example.com", household_name="Other")
    found = (await client.get("/api/ingredients?q=tortilla", headers=stranger)).json()
    assert tortilla["id"] not in [i["id"] for i in found]
    product = (await client.get(f"/api/barcode/{CODE}", headers=stranger)).json()
    assert product["ingredient"] is None
    theirs = (await add(client, stranger)).json()
    assert theirs["id"] != tortilla["id"]


@pytest.mark.parametrize(
    "over",
    [{"name": ""}, {"name": "x" * 121}, {"piece_g": 0}, {"per": "100oz"}, {"per100": {"kcal": 1}}],
)
async def test_validation(client, auth, off, over):
    assert (await add(client, auth, **over)).status_code == 422


async def test_bad_barcode_is_rejected(client, auth):
    payload = {"name": "x", "per100": TORTILLA}
    response = await client.post("/api/barcode/12ab/ingredient", json=payload, headers=auth)
    assert response.status_code == 422
