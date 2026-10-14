from datetime import timedelta

from sqlalchemy import select

from app.logs.models import FoodLog
from app.snacks.models import SavedSnack
from tests.conftest import register
from tests.test_snacks import COOKIE, TODAY, analyze, snack

TIRAMISU = {"kcal": 420, "protein": 7, "carbs": 38, "fat": 26, "fiber": 0.5, "sugar": 27}


async def save_from_photo(client, auth, session) -> dict:
    answer = {"name": "Tiramisu", "kind": "sweet", "unit": "piece", "amount": 1, "values": TIRAMISU}
    job, _ = await analyze(client, auth, session, "snack", answer)
    body = snack(
        name="Tiramisu", emoji="🍰", source="photo", per_unit=TIRAMISU, analysis_id=job["id"]
    )
    response = await client.post("/api/snacks", json=body | {"save": True}, headers=auth)
    assert response.status_code == 201, response.text
    return response.json()


async def saved(client, headers) -> list[dict]:
    response = await client.get("/api/snacks/saved", headers=headers)
    assert response.status_code == 200
    return response.json()


async def test_saving_a_photographed_snack_keeps_photo_values_and_amount(client, auth, session):
    logged = await save_from_photo(client, auth, session)

    [tiramisu] = await saved(client, auth)
    assert logged["saved_id"] == tiramisu["id"]
    assert tiramisu | {"id": 0} == {
        "id": 0,
        "name": "Tiramisu",
        "emoji": "🍰",
        "kind": "sweet",
        "per": "piece",
        "amount": 1,
        "per_unit": TIRAMISU,
        "photo_url": f"/api/snacks/saved/{tiramisu['id']}/photo",
        "last_eaten_on": TODAY.isoformat(),
    }
    photo = await client.get(tiramisu["photo_url"], headers=auth)
    assert photo.status_code == 200 and photo.content[:2] == b"\xff\xd8"


async def test_saving_the_same_name_again_updates_instead_of_duplicating(client, auth):
    await client.post("/api/snacks", json=snack(save=True), headers=auth)
    later = (TODAY + timedelta(days=1)).isoformat()
    bigger = COOKIE | {"kcal": 200}
    body = snack(name=" cookie ", per_unit=bigger, eaten_on=later, save=True)
    await client.post("/api/snacks", json=body, headers=auth)

    [cookie] = await saved(client, auth)
    assert (cookie["name"], cookie["per_unit"]["kcal"]) == ("Cookie", 200)
    assert cookie["photo_url"] is None and cookie["last_eaten_on"] == later


async def test_not_saving_is_the_default(client, auth):
    response = await client.post("/api/snacks", json=snack(), headers=auth)
    assert response.json()["saved_id"] is None
    assert await saved(client, auth) == []


async def test_log_a_saved_snack_again(client, auth, session):
    tiramisu = (await save_from_photo(client, auth, session))["saved_id"]
    later = (TODAY + timedelta(days=3)).isoformat()

    body = snack(name="Tiramisu", source="saved", per_unit=TIRAMISU, amount=2, eaten_on=later)
    response = await client.post("/api/snacks", json=body | {"saved_id": tiramisu}, headers=auth)
    assert response.status_code == 201
    assert response.json()["kcal"] == 840

    entries = list(await session.scalars(select(FoodLog).order_by(FoodLog.id)))
    assert [e.source for e in entries] == ["photo", "saved"]
    assert (await saved(client, auth))[0]["last_eaten_on"] == later


async def test_partner_sees_our_snacks_other_households_dont(client, auth, session):
    tiramisu = (await save_from_photo(client, auth, session))["saved_id"]
    code = (await client.get("/api/auth/me", headers=auth)).json()["household"]["invite_code"]
    partner = await register(client, "ana@example.com", "Ana", invite_code=code)
    stranger = await register(client, "eve@example.com", "Eve")

    assert [s["name"] for s in await saved(client, partner)] == ["Tiramisu"]
    assert await saved(client, stranger) == []
    url = f"/api/snacks/saved/{tiramisu}"
    assert (await client.get(f"{url}/photo", headers=stranger)).status_code == 404
    assert (await client.patch(url, json={"name": "Mine"}, headers=stranger)).status_code == 404
    assert (await client.delete(url, headers=stranger)).status_code == 404
    body = snack(source="saved", saved_id=tiramisu)
    assert (await client.post("/api/snacks", json=body, headers=stranger)).status_code == 404


async def test_edit_and_delete_a_saved_snack_keeps_past_days(client, auth, session):
    tiramisu = (await save_from_photo(client, auth, session))["saved_id"]
    url = f"/api/snacks/saved/{tiramisu}"

    patch = {"name": "Mum's tiramisu", "amount": 2, "per_unit": TIRAMISU | {"kcal": 380}}
    edited = (await client.patch(url, json=patch, headers=auth)).json()
    assert (edited["name"], edited["amount"], edited["per_unit"]["kcal"]) == (
        "Mum's tiramisu",
        2,
        380,
    )
    assert (await client.patch(url, json={"name": ""}, headers=auth)).status_code == 422

    assert (await client.delete(url, headers=auth)).status_code == 204
    assert await saved(client, auth) == []
    assert (await client.delete(url, headers=auth)).status_code == 404
    assert len(list(await session.scalars(select(FoodLog)))) == 1  # the day keeps its tiramisu
    assert (await session.scalars(select(SavedSnack))).first() is None


async def test_renaming_onto_another_saved_name_is_a_conflict(client, auth):
    await client.post("/api/snacks", json=snack(save=True), headers=auth)
    other = snack(name="Brownie", save=True)
    brownie = (await client.post("/api/snacks", json=other, headers=auth)).json()["saved_id"]
    response = await client.patch(
        f"/api/snacks/saved/{brownie}", json={"name": "COOKIE"}, headers=auth
    )
    assert response.status_code == 409


async def test_photo_of_a_snack_saved_without_one_is_404(client, auth):
    saved_id = (await client.post("/api/snacks", json=snack(save=True), headers=auth)).json()[
        "saved_id"
    ]
    response = await client.get(f"/api/snacks/saved/{saved_id}/photo", headers=auth)
    assert response.status_code == 404


async def test_saved_snacks_need_login(client):
    assert (await client.get("/api/snacks/saved")).status_code == 401
