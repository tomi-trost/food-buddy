"""How our household counts an ingredient: PUT /api/ingredients/{id}/unit, shown everywhere."""

import pytest

from tests.conftest import CODE, ingredient_ids, register
from tests.test_meals import body


async def unit_of(client, auth, ingredient_id: int) -> tuple[str, float]:
    found = (await client.get("/api/ingredients?q=broccoli", headers=auth)).json()
    row = next(i for i in found if i["id"] == ingredient_id)
    return row["unit"], row["unit_grams"]


async def test_count_an_ingredient_in_pieces_for_our_household(client, auth, seeded):
    (broccoli,) = await ingredient_ids(seeded, "Broccoli")
    await seeded.rollback()
    assert await unit_of(client, auth, broccoli) == ("g", 1)

    response = await client.put(
        f"/api/ingredients/{broccoli}/unit", json={"unit": "pc", "unit_grams": 300}, headers=auth
    )
    assert response.status_code == 200, response.text
    assert (response.json()["unit"], response.json()["unit_grams"]) == ("pc", 300)
    assert await unit_of(client, auth, broccoli) == ("pc", 300)  # search shows it our way

    # meals show it in pieces too; amounts are still stored in grams
    items = [{"ingredient_id": broccoli, "grams": 150}]
    meal = (
        await client.post("/api/meals", json=await body(seeded, items=items), headers=auth)
    ).json()
    row = meal["ingredients"][0]
    assert (row["ingredient"]["unit"], row["ingredient"]["unit_grams"], row["grams"]) == (
        "pc",
        300,
        300,
    )

    # the partner sees the same; another household doesn't
    code = (await client.get("/api/auth/me", headers=auth)).json()["household"]["invite_code"]
    partner = await register(client, email="p@example.com", name="Ana", invite_code=code)
    assert await unit_of(client, partner, broccoli) == ("pc", 300)
    stranger = await register(client, email="x@example.com", household_name="Other")
    assert await unit_of(client, stranger, broccoli) == ("g", 1)


async def test_back_to_grams_or_ml(client, auth, seeded):
    (broccoli,) = await ingredient_ids(seeded, "Broccoli")
    await seeded.rollback()
    url = f"/api/ingredients/{broccoli}/unit"
    await client.put(url, json={"unit": "pc", "unit_grams": 300}, headers=auth)
    grams = (await client.put(url, json={"unit": "g", "unit_grams": 300}, headers=auth)).json()
    assert (grams["unit"], grams["unit_grams"]) == ("g", 1)  # grams are grams
    ml = (await client.put(url, json={"unit": "ml"}, headers=auth)).json()
    assert (ml["unit"], ml["unit_grams"]) == ("ml", 1)


@pytest.mark.parametrize(
    "payload",
    [{"unit": "slice"}, {"unit": "pc", "unit_grams": 0}, {"unit": "pc", "unit_grams": 5000}],
)
async def test_unit_validation(client, auth, seeded, payload):
    (broccoli,) = await ingredient_ids(seeded, "Broccoli")
    await seeded.rollback()
    response = await client.put(f"/api/ingredients/{broccoli}/unit", json=payload, headers=auth)
    assert response.status_code == 422


async def test_unknown_or_other_households_ingredient_is_404(client, auth):
    assert (
        await client.put("/api/ingredients/999999/unit", json={"unit": "g"}, headers=auth)
    ).status_code == 404
    other = await register(client, email="x@example.com", household_name="Other")
    tortilla = await client.post(
        f"/api/barcode/{CODE}/ingredient",
        json={
            "name": "Wraps",
            "per100": {"kcal": 300, "protein": 9, "carbs": 50, "fat": 6, "fiber": 2, "sugar": 3},
        },
        headers=other,
    )
    theirs = tortilla.json()["id"]
    mine = await client.put(
        f"/api/ingredients/{theirs}/unit", json={"unit": "pc", "unit_grams": 60}, headers=auth
    )
    assert mine.status_code == 404
