async def test_search_prefix_first_then_fuzzy(client, auth, seeded):
    names = [i["name"] for i in (await client.get("/api/ingredients?q=chick", headers=auth)).json()]
    assert names[:2] == ["Chicken breast", "Chickpeas"]


async def test_search_finds_aliases_and_typos(client, auth, seeded):
    by_alias = (await client.get("/api/ingredients?q=pasta", headers=auth)).json()
    assert by_alias[0]["name"] == "Spaghetti"
    typo = (await client.get("/api/ingredients?q=brocoli", headers=auth)).json()
    assert typo[0]["name"] == "Broccoli"


async def test_search_returns_metadata_and_respects_limit(client, auth, seeded):
    everything = (await client.get("/api/ingredients?limit=5", headers=auth)).json()
    assert len(everything) == 5
    assert everything[0]["name"] == "Avocado"  # alphabetical without a query
    first = everything[0]
    assert set(first) == {"id", "name", "emoji", "category", "location", "price_per_100g"} | {
        "per100",
        "unit",
        "unit_grams",
    }
    assert first["per100"]["kcal"] == 160
    assert (first["unit"], first["unit_grams"]) == ("pc", 150)  # an avocado is counted


async def test_units_pieces_slices_cloves_and_ml(client, auth, seeded):
    from app.nutrition.units import unit_of

    found = {
        i["name"]: (i["unit"], i["unit_grams"])
        for i in (await client.get("/api/ingredients?limit=100", headers=auth)).json()
    }
    assert found["Eggs"] == ("pc", 50)
    assert found["Banana"] == ("pc", 120)
    assert found["Milk"] == ("ml", 1.03)
    assert found["Olive oil"] == ("ml", 0.91)
    assert found["Sourdough"] == ("slice", 50)
    assert found["Chicken breast"] == ("g", 1)  # meat stays in grams
    assert unit_of("Garlic", curated=True) == ("clove", 5)
    assert unit_of("  EGGS ", curated=True) == ("pc", 50)
    # the long USDA/Ciqual rows aren't listed: "Milk" there would be a different product
    assert unit_of("Milk", curated=False) == ("g", 1.0)


async def test_search_requires_auth_and_handles_special_chars(client, auth, seeded):
    assert (await client.get("/api/ingredients?q=x")).status_code == 401
    weird = await client.get("/api/ingredients?q=%25_", headers=auth)
    assert weird.status_code == 200


async def test_multi_word_query_falls_back_to_single_words(client, auth, seeded):
    """The picker starts with the model's phrase (e.g. "ground meat"); suggest word matches."""
    names = [
        i["name"] for i in (await client.get("/api/ingredients?q=ground meat", headers=auth)).json()
    ]
    assert "Beef mince" in names  # alias "ground beef"
    sauce = [
        i["name"]
        for i in (await client.get("/api/ingredients?q=mystery sauce", headers=auth)).json()
    ]
    assert "Soy sauce" in sauce
