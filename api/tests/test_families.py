"""Dish families: guessed from the name, then the main ingredients; ours wins when picked."""

import pytest

from app.meals.families import OTHER, guess_family
from tests.conftest import ingredient_ids, register
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


@pytest.mark.parametrize(
    ("name", "ingredients", "family"),
    [
        ("Chicken breast with roasted vegetables", [], "Protein & veg plates"),  # ours, was Meat
        ("Sunday dinner", ["Chicken thigh", "Potato", "Zucchini"], "Protein & veg plates"),
        ("Tofu with broccoli", [], "Protein & veg plates"),
        ("Chicken rice bowl", ["Rice (cooked)", "Chicken breast", "Broccoli"], "Rice & grains"),
        ("Teriyaki", ["Rice (cooked)", "Chicken breast", "Broccoli"], "Rice & grains"),  # starch
        ("Grilled chicken", ["Chicken breast"], "Meat & fish"),  # no vegetables
        ("Potato gratin", [], "Potatoes"),
        ("Gnocchi with butter", [], "Potatoes"),  # a potato base, like sweet potato
    ],
)
def test_protein_and_veg_plates(name, ingredients, family):
    assert guess_family(name, ingredients) == family


async def plate(client, auth, seeded, name, *ingredients, family=None) -> dict:
    ids = await ingredient_ids(seeded, *ingredients)
    payload = await body(
        seeded,
        name=name,
        meal_type="dinner",
        items=[{"ingredient_id": i, "grams": 300 - 50 * n} for n, i in enumerate(ids)],
    )
    meal = (await client.post("/api/meals", json=payload, headers=auth)).json()
    if family:
        url = f"/api/meals/{meal['id']}"
        meal = (await client.patch(url, json={"family": family}, headers=auth)).json()
    return meal


async def test_a_family_we_make_learns_from_its_meals(client, auth, seeded, queue):
    await plate(client, auth, seeded, "Mama's broccoli chicken", "Chicken breast", "Broccoli",
                "Spinach", family="Mama's")  # fmt: skip
    one = (await client.get("/api/families", headers=auth)).json()
    assert one == [{"name": "Mama's", "members": 1, "words": [], "ingredients": [],
                    "blocked_words": [], "blocked_ingredients": []}]  # fmt: skip
    await plate(client, auth, seeded, "Broccoli chicken bake", "Chicken breast", "Broccoli",
                "Olive oil", family="Mama's")  # fmt: skip

    learned = (await client.get("/api/families", headers=auth)).json()[0]
    assert learned["members"] == 2
    assert learned["words"] == ["broccoli", "chicken"]  # in both names
    assert [i["name"] for i in learned["ingredients"]] == ["Broccoli", "Chicken breast"]

    new = await plate(client, auth, seeded, "Chicken skewers", "Chicken breast", "Broccoli")
    assert (new["family"], new["family_picked"]) == (
        "Mama's",
        False,
    )  # guessed from what it learned
    other = await plate(client, auth, seeded, "Broccoli soup", "Broccoli", "Onions")
    assert other["family"] == "Soups & stews"  # 1 word + 1 ingredient of 4 learned: not enough
    mine = await plate(client, auth, seeded, "Chicken broccoli", "Chicken breast", "Broccoli",
                       family="Weeknight")  # fmt: skip
    assert mine["family"] == "Weeknight"  # our pick always wins


async def test_tell_a_family_to_stop_matching_a_word(client, auth, seeded, queue):
    for name in ("Broccoli chicken", "Chicken with broccoli"):
        await plate(client, auth, seeded, name, "Chicken breast", "Broccoli", family="Mama's")
    broccoli = (await ingredient_ids(seeded, "Broccoli"))[0]
    blocks = {"name": "Mama's", "blocked_words": [" Broccoli "], "blocked_ingredients": [broccoli]}
    response = await client.put("/api/families/blocks", json=blocks, headers=auth)
    assert response.status_code == 200, response.text
    f = response.json()
    assert (f["words"], [i["name"] for i in f["ingredients"]]) == (["chicken"], ["Chicken breast"])
    assert (f["blocked_words"], f["blocked_ingredients"][0]["name"]) == (["broccoli"], "Broccoli")

    soup = await plate(client, auth, seeded, "Broccoli chicken soup", "Broccoli", "Chicken breast")
    assert soup["family"] == "Mama's"  # chicken (word + ingredient) is all it matches on now

    unknown = await client.put("/api/families/blocks", json={"name": "Nope"}, headers=auth)
    assert unknown.status_code == 404
    stranger = await register(client, email="x@example.com", household_name="Other")
    theirs = await client.put("/api/families/blocks", json=blocks, headers=stranger)
    assert theirs.status_code == 404
    assert (await client.get("/api/families", headers=stranger)).json() == []


async def test_rename_a_family_moves_its_picked_and_guessed_meals(client, auth, seeded, queue):
    for name in ("Broccoli chicken", "Chicken with broccoli"):
        await plate(client, auth, seeded, name, "Chicken breast", "Broccoli", family="Mama's")
    guessed = await plate(
        client, auth, seeded, "Chicken broccoli bake", "Chicken breast", "Broccoli"
    )
    assert (guessed["family"], guessed["family_picked"]) == ("Mama's", False)
    pasta = await plate(client, auth, seeded, "Pasta with pesto", "Broccoli")
    blocks = {"name": "Mama's", "blocked_words": ["bake"], "blocked_ingredients": []}
    await client.put("/api/families/blocks", json=blocks, headers=auth)

    response = await client.put(
        "/api/families/rename", json={"name": "Mama's", "to": " Grandma's "}, headers=auth
    )
    assert response.status_code == 200, response.text
    assert response.json() == {"name": "Grandma's", "meals": 3}
    cards = {c["name"]: c for c in (await client.get("/api/meals", headers=auth)).json()}
    assert {cards[n]["family"] for n in ("Broccoli chicken", "Chicken broccoli bake")} == {
        "Grandma's"
    }
    assert cards["Chicken broccoli bake"]["family_picked"] is True  # now ours
    assert cards[pasta["name"]]["family"] == "Pasta"  # other families stay
    [learned] = (await client.get("/api/families", headers=auth)).json()
    assert (learned["name"], learned["members"]) == ("Grandma's", 3)

    # a guessed built-in family can be renamed too; into one that exists merges them
    merged = await client.put(
        "/api/families/rename", json={"name": "Pasta", "to": "Grandma's"}, headers=auth
    )
    assert merged.json() == {"name": "Grandma's", "meals": 1}
    families = (await client.get("/api/families", headers=auth)).json()
    assert [(f["name"], f["members"]) for f in families] == [("Grandma's", 4)]


async def test_rename_validation_and_other_households(client, auth, seeded, queue):
    await plate(client, auth, seeded, "Pasta with pesto", "Broccoli")
    blank = await client.put(
        "/api/families/rename", json={"name": "Pasta", "to": "  "}, headers=auth
    )
    assert blank.status_code == 422
    unknown = await client.put(
        "/api/families/rename", json={"name": "Nope", "to": "X"}, headers=auth
    )
    assert unknown.status_code == 404
    stranger = await register(client, email="x@example.com", household_name="Other")
    theirs = await client.put(
        "/api/families/rename", json={"name": "Pasta", "to": "X"}, headers=stranger
    )
    assert theirs.status_code == 404
    assert (await client.get("/api/meals", headers=auth)).json()[0]["family"] == "Pasta"
