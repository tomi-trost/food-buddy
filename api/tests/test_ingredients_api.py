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
    assert set(first) == {"id", "name", "emoji", "category", "location", "price_per_100g", "per100"}
    assert first["per100"]["kcal"] == 160


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
