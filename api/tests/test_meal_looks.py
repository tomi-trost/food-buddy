"""How a meal card looks: our own emoji, a photo added after posting."""

import pytest

from tests.conftest import jpeg_bytes, register
from tests.test_meals import body


async def meal_id(client, auth, seeded) -> int:
    return (await client.post("/api/meals", json=await body(seeded), headers=auth)).json()["id"]


async def test_pick_our_own_emoji(client, auth, seeded, queue):
    mid = await meal_id(client, auth, seeded)
    response = await client.patch(f"/api/meals/{mid}", json={"emoji": " 🥞 "}, headers=auth)
    assert response.status_code == 200, response.text
    assert response.json()["emoji"] == "🥞"
    card = (await client.get("/api/meals", headers=auth)).json()[0]
    assert card["emoji"] == "🥞"


@pytest.mark.parametrize("emoji", ["", "  ", "pancake", "🥞" * 9])
async def test_emoji_must_be_an_emoji(client, auth, seeded, queue, emoji):
    mid = await meal_id(client, auth, seeded)
    response = await client.patch(f"/api/meals/{mid}", json={"emoji": emoji}, headers=auth)
    assert response.status_code == 422


async def test_add_a_photo_to_a_typed_meal(client, auth, seeded, queue):
    mid = await meal_id(client, auth, seeded)
    files = {"photo": ("p.jpg", jpeg_bytes(), "image/jpeg")}
    response = await client.put(f"/api/meals/{mid}/photo", files=files, headers=auth)
    assert response.status_code == 200, response.text
    assert response.json()["photo_url"] == f"/api/meals/{mid}/photo"
    photo = await client.get(f"/api/meals/{mid}/photo", headers=auth)
    assert photo.status_code == 200 and photo.headers["content-type"] == "image/jpeg"


async def test_meal_photo_checks_the_file_and_the_household(client, auth, seeded, queue):
    mid = await meal_id(client, auth, seeded)
    junk = {"photo": ("p.jpg", b"not an image", "image/jpeg")}
    assert (
        await client.put(f"/api/meals/{mid}/photo", files=junk, headers=auth)
    ).status_code == 422
    stranger = await register(client, email="x@example.com", household_name="Other")
    files = {"photo": ("p.jpg", jpeg_bytes(), "image/jpeg")}
    response = await client.put(f"/api/meals/{mid}/photo", files=files, headers=stranger)
    assert response.status_code == 404
