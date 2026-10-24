"""Aliases (#18): the name a dish took the place of is offered as a swap on the next photo."""

from tests.conftest import register
from tests.fakes import vision_transport
from tests.test_analysis import process
from tests.test_analysis_queue import snap
from tests.test_bundles import pancake_plate, post

SAUCE = 3  # "mystery sauce" is the 4th item the fake model sees on the plate


async def plate_with_sauce_dish(client, auth, seeded, **over) -> dict:
    """Pancakes made from the photo's "mystery sauce" and "Pancakes" (its own name: no alias)."""
    data = await pancake_plate(seeded, **over)
    data["components"][0]["aliases"] = [" Mystery  Sauce ", "healthy banana pancakes"]
    return await post(client, auth, data)


async def checked_photo(client, auth, seeded) -> dict:
    job = await snap(client, auth)
    await process(seeded, job, vision_transport())
    response = await client.get(f"/api/analyses/{job}", headers=auth)
    assert response.status_code == 200, response.text
    return response.json()


async def test_a_swap_becomes_an_alias_and_is_offered_next_time(client, auth, seeded, queue):
    plate = await plate_with_sauce_dish(client, auth, seeded)
    dish_id = plate["components"][0]["id"]
    dish = (await client.get(f"/api/meals/{dish_id}", headers=auth)).json()
    assert dish["aliases"] == ["mystery sauce"]  # tidied; the dish's own name isn't one

    job = await checked_photo(client, auth, seeded)
    [suggestion] = job["dishes"]
    assert suggestion["item"] == SAUCE
    assert suggestion["name"] == "mystery sauce"
    assert suggestion["dish"] == {
        "id": dish_id,
        "name": "Healthy banana pancakes",
        "emoji": "🍌",
        "portions": 4,
        "portion_g": 300,
        "cost": 2.4,
        "per_portion": dish["per_portion"],
    }
    # the banner list carries them too; another household never sees ours
    assert (await client.get("/api/analyses/open", headers=auth)).json()[0]["dishes"]
    other = await register(client, email="other@example.com", name="Other")
    assert (await checked_photo(client, other, seeded))["dishes"] == []


async def test_three_nos_in_a_row_stop_asking_until_we_swap_again(client, auth, seeded, queue):
    plate = await plate_with_sauce_dish(client, auth, seeded)
    dish_id = plate["components"][0]["id"]
    url = f"/api/meals/{dish_id}/aliases/decline"
    for n in range(3):
        assert (await checked_photo(client, auth, seeded))["dishes"], n
        response = await client.post(url, json={"name": "Mystery sauce"}, headers=auth)
        assert response.status_code == 204, response.text
    assert (await checked_photo(client, auth, seeded))["dishes"] == []

    # Swapping it by hand again (a plate with the dish for "mystery sauce") counts from zero
    again = await pancake_plate(
        seeded, components=[{"meal_id": dish_id, "portions": 1, "aliases": ["mystery sauce"]}]
    )
    await post(client, auth, again)
    assert (await checked_photo(client, auth, seeded))["dishes"][0]["dish"]["id"] == dish_id


async def test_decline_checks(client, auth, seeded, queue):
    plate = await plate_with_sauce_dish(client, auth, seeded)
    url = f"/api/meals/{plate['components'][0]['id']}/aliases/decline"
    assert (await client.post(url, json={"name": "not an alias"}, headers=auth)).status_code == 204
    assert (await client.post(url, json={"name": " "}, headers=auth)).status_code == 422
    other = await register(client, email="other@example.com", name="Other")
    assert (
        await client.post(url, json={"name": "mystery sauce"}, headers=other)
    ).status_code == 404


async def test_aliases_are_editable(client, auth, seeded, queue):
    plate = await plate_with_sauce_dish(client, auth, seeded)
    url = f"/api/meals/{plate['components'][0]['id']}"
    response = await client.patch(
        url, json={"aliases": ["Pancakes", "mystery sauce", "Mystery Sauce"]}, headers=auth
    )
    assert response.status_code == 200, response.text
    assert response.json()["aliases"] == ["mystery sauce", "pancakes"]
    cleared = await client.patch(url, json={"aliases": []}, headers=auth)
    assert cleared.json()["aliases"] == []
    assert (await checked_photo(client, auth, seeded))["dishes"] == []

    too_long = await client.patch(url, json={"aliases": ["x" * 81]}, headers=auth)
    assert too_long.status_code == 422
    too_many = await client.patch(url, json={"aliases": [f"a{n}" for n in range(11)]}, headers=auth)
    assert too_many.status_code == 422


async def test_a_posted_photo_has_nothing_to_ask(client, auth, seeded, queue):
    await plate_with_sauce_dish(client, auth, seeded)
    job = await checked_photo(client, auth, seeded)
    response = await client.post(
        "/api/meals", json=await pancake_plate(seeded, analysis_id=job["id"]), headers=auth
    )
    assert response.status_code == 201, response.text
    assert (await client.get(f"/api/analyses/{job['id']}", headers=auth)).json()["dishes"] == []
