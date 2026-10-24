"""Dish families: guessed from the name, then the main ingredients; ours wins when picked."""

import pytest

from app.meals.families import OTHER, guess_family
from tests.conftest import register
from tests.test_meals import body


@pytest.mark.parametrize(
    ("name", "ingredients", "family"),
    [
        ("Pasta with tuna sauce", [], "Pasta"),
        ("Spaghetti carbonara", [], "Pasta"),
        ("Chia pudding with fruit", [], "Oats & chia"),  # not a dessert
        ("Overnight oats", [], "Oats & chia"),
        ("Banana pancakes with nutella and mango", [], "Pancakes & waffles"),
        ("Arancino", [], "Rice & grains"),
        ("Grilled eggplant", [], "Veggie plates"),  # not eggs
        ("Ricotta toast", [], "Sandwiches & wraps"),  # not rice
        ("Šakšuka", [], "Eggs"),
        ("Chickpea and tempeh stew", [], "Soups & stews"),
        ("Mystery plate", ["Egg pasta", "Tomato paste"], "Pasta"),  # from the heaviest one
        ("Sunday plate", ["Salt", "Water", "Olive oil", "Rice (cooked)"], OTHER),  # top 3 only
        ("Coffee espresso", [], OTHER),
    ],
)
def test_guess_family(name, ingredients, family):
    assert guess_family(name, ingredients) == family


async def test_family_is_guessed_picked_and_reset(client, auth, seeded, queue):
    meal = (await client.post("/api/meals", json=await body(seeded), headers=auth)).json()
    assert (meal["family"], meal["family_picked"]) == ("Rice & grains", False)  # rice is heaviest
    url = f"/api/meals/{meal['id']}"

    picked = await client.patch(url, json={"family": " Bowls "}, headers=auth)
    assert (picked.json()["family"], picked.json()["family_picked"]) == ("Bowls", True)
    card = (await client.get("/api/meals", headers=auth)).json()[0]
    assert card["family"] == "Bowls"

    reset = await client.patch(url, json={"family": ""}, headers=auth)
    assert (reset.json()["family"], reset.json()["family_picked"]) == ("Rice & grains", False)

    too_long = await client.patch(url, json={"family": "x" * 41}, headers=auth)
    assert too_long.status_code == 422
    stranger = await register(client, email="x@example.com", household_name="Other")
    assert (await client.patch(url, json={"family": "Mine"}, headers=stranger)).status_code == 404
