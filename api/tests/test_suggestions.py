"""When one of us logs a meal, the other gets it suggested: log it too, or say no."""

from datetime import timedelta

import pytest
from sqlalchemy import select

from app.inventory.models import InventoryItem
from app.logs.models import FoodLog
from app.push import notify
from tests.conftest import register
from tests.fakes import FakePhone
from tests.test_analysis_queue import partner_of
from tests.test_meals import TODAY, body, stock
from tests.test_push import deliver, push_on, subscribe  # noqa: F401 (fixture)

pytestmark = pytest.mark.usefixtures("queue")


async def pending(client, headers, today=TODAY) -> list[dict]:
    response = await client.get(f"/api/suggestions?today={today.isoformat()}", headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


async def post(client, auth, seeded, **over) -> dict:
    response = await client.post("/api/meals", json=await body(seeded, **over), headers=auth)
    assert response.status_code == 201, response.text
    return response.json()


async def test_my_meal_is_suggested_to_my_partner_not_to_me(client, auth, seeded, queue):
    partner = await partner_of(client, auth)
    meal = await post(client, auth, seeded)

    assert await pending(client, auth) == []
    [suggestion] = await pending(client, partner)
    assert suggestion | {"id": 0} == {
        "id": 0,
        "by": {"id": 1, "name": "Tomi", "color": "#b9532f"},
        "meal": {
            "id": meal["id"],
            "name": "Chicken rice bowl",
            "emoji": meal["emoji"],
            "photo_url": None,
            "kcal_per_portion": meal["per_portion"]["kcal"],
        },
        "meal_type": "lunch",
        "eaten_on": TODAY.isoformat(),
    }
    tasks = [j for j in queue.jobs.values() if j["task_name"] == "notify_suggested"]
    assert [j["args"] for j in tasks] == [{"suggestion_id": suggestion["id"]}]


async def test_accepting_logs_it_for_me_without_taking_stock_again(client, auth, seeded):
    partner = await partner_of(client, auth)
    meal = await post(client, auth, seeded)
    rice = await stock(seeded, "Rice (cooked)", 1000)
    [suggestion] = await pending(client, partner)

    response = await client.post(
        f"/api/suggestions/{suggestion['id']}/accept", json={"servings_eaten": 1.5}, headers=partner
    )
    assert response.status_code == 200, response.text

    entry = (await seeded.scalars(select(FoodLog).order_by(FoodLog.id.desc()))).first()
    assert (entry.user_id, entry.meal_id, entry.meal_type, entry.source, entry.servings) == (
        2,
        meal["id"],
        "lunch",
        "shared",
        1.5,
    )
    assert entry.kcal == round(meal["per_portion"]["kcal"] * 1.5, 1)
    assert entry.eaten_on == TODAY
    seeded.expire_all()
    assert [i.grams for i in await seeded.scalars(select(InventoryItem))] == [1000]
    assert rice
    assert await pending(client, partner) == []
    again = await client.post(
        f"/api/suggestions/{suggestion['id']}/accept", json={}, headers=partner
    )
    assert again.status_code == 409


async def test_accepted_suggestion_is_not_suggested_back(client, auth, seeded):
    partner = await partner_of(client, auth)
    await post(client, auth, seeded)
    [suggestion] = await pending(client, partner)
    await client.post(f"/api/suggestions/{suggestion['id']}/accept", json={}, headers=partner)
    assert await pending(client, auth) == []


async def test_declining_hides_it(client, auth, seeded):
    partner = await partner_of(client, auth)
    await post(client, auth, seeded)
    [suggestion] = await pending(client, partner)

    url = f"/api/suggestions/{suggestion['id']}"
    assert (await client.post(f"{url}/decline", headers=partner)).status_code == 204
    assert await pending(client, partner) == []
    assert (await client.post(f"{url}/accept", json={}, headers=partner)).status_code == 409
    assert len(list(await seeded.scalars(select(FoodLog)))) == 1  # only mine


async def test_cooking_again_and_leftovers_are_suggested_too(client, auth, seeded):
    partner = await partner_of(client, auth)
    meal = await post(client, auth, seeded, eaten=False, eaten_on=None)  # saved for later
    assert await pending(client, partner) == []

    later = TODAY + timedelta(days=1)
    for cooked, meal_type in ((True, "dinner"), (False, "lunch")):
        cook = {"meal_type": meal_type, "eaten_on": later.isoformat(), "cooked": cooked}
        await client.post(f"/api/meals/{meal['id']}/cook", json=cook, headers=auth)
    shown = await pending(client, partner, today=later)
    assert sorted(s["meal_type"] for s in shown) == ["dinner", "lunch"]


async def test_nothing_to_suggest_if_partner_already_logged_it(client, auth, seeded):
    partner = await partner_of(client, auth)
    meal = await post(client, auth, seeded)
    cook = {"meal_type": "lunch", "eaten_on": TODAY.isoformat(), "cooked": False}
    await client.post(f"/api/meals/{meal['id']}/cook", json=cook, headers=partner)

    # mine to her is resolved by her own entry; hers to me: I already have it too
    assert await pending(client, partner) == []
    assert await pending(client, auth) == []


async def test_only_today_and_yesterday_are_shown(client, auth, seeded):
    partner = await partner_of(client, auth)
    await post(client, auth, seeded)
    assert len(await pending(client, partner, today=TODAY + timedelta(days=1))) == 1
    assert await pending(client, partner, today=TODAY + timedelta(days=2)) == []
    assert await pending(client, partner, today=TODAY - timedelta(days=1)) == []  # future


async def test_only_the_person_it_was_suggested_to_can_answer(client, auth, seeded):
    partner = await partner_of(client, auth)
    stranger = await register(client, "eve@example.com", "Eve")
    await post(client, auth, seeded)
    [suggestion] = await pending(client, partner)
    url = f"/api/suggestions/{suggestion['id']}"
    for who in (auth, stranger):
        assert (await client.post(f"{url}/accept", json={}, headers=who)).status_code == 404
        assert (await client.post(f"{url}/decline", headers=who)).status_code == 404
    assert (await client.post("/api/suggestions/999/decline", headers=partner)).status_code == 404


@pytest.mark.parametrize("servings", [0, 1.25, 11])
async def test_accept_validates_portions(client, auth, seeded, servings):
    partner = await partner_of(client, auth)
    await post(client, auth, seeded)
    [suggestion] = await pending(client, partner)
    response = await client.post(
        f"/api/suggestions/{suggestion['id']}/accept",
        json={"servings_eaten": servings},
        headers=partner,
    )
    assert response.status_code == 422


async def test_suggestions_need_login_and_a_date(client, auth):
    assert (await client.get("/api/suggestions?today=2026-10-04")).status_code == 401
    assert (await client.get("/api/suggestions", headers=auth)).status_code == 422


async def test_no_partner_no_suggestions(client, auth, seeded, queue):
    await post(client, auth, seeded)
    assert not [j for j in queue.jobs.values() if j["task_name"] == "notify_suggested"]


async def test_push_tells_my_partner_what_i_had(client, auth, seeded, push_on):  # noqa: F811
    partner = await partner_of(client, auth)
    mine, hers = FakePhone("https://web.push.apple.com/mine"), FakePhone()
    await subscribe(client, auth, mine)
    await subscribe(client, partner, hers)
    await post(client, auth, seeded)
    [suggestion] = await pending(client, partner)

    call = lambda s, http: notify.notify_suggested(s, http, suggestion["id"])  # noqa: E731
    seen = await deliver(seeded, call)
    assert [str(r.url) for r in seen] == [hers.endpoint]
    message = hers.read(seen[0])
    assert message["title"] == "Tomi had Chicken rice bowl for lunch"
    assert message["body"] == "Did you eat it too? Tap to log it."
    assert message["url"] == "/"

    await client.post(f"/api/suggestions/{suggestion['id']}/decline", headers=partner)
    assert await deliver(seeded, call) == []  # answered meanwhile: no push
