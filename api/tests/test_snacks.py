from datetime import date, timedelta

import httpx
import pytest
from sqlalchemy import select

from app.analysis.service import run_analysis
from app.config import get_settings
from app.logs.models import FoodLog
from app.vision.providers import chain_from_settings
from tests.conftest import jpeg_bytes, register
from tests.fakes import vision_transport

TODAY = date(2026, 10, 4)
COOKIE = {"kcal": 140, "protein": 2, "carbs": 19, "fat": 6, "fiber": 0.5, "sugar": 10}


def snack(**over):
    return {
        "eaten_on": TODAY.isoformat(),
        "name": "Cookie",
        "emoji": "🍪",
        "kind": "sweet",
        "source": "list",
        "per": "piece",
        "amount": 1,
        "per_unit": COOKIE,
    } | over


async def test_catalog_is_the_mock_list_plus_fruit(client, auth):
    items = (await client.get("/api/snacks/catalog", headers=auth)).json()
    assert len(items) == 13
    assert {i["kind"] for i in items} == {"sweet", "savory", "fruit", "drink"}
    assert [i["name"] for i in items if i["kind"] == "fruit"] == ["Apple", "Pear", "Banana"]
    assert items[1] == {
        "key": "cookie",
        "name": "Cookie",
        "emoji": "🍪",
        "kind": "sweet",
        "per_unit": COOKIE,
    }


async def test_log_snack_scales_pieces_and_grams(client, auth, session):
    two = await client.post("/api/snacks", json=snack(amount=2), headers=auth)
    assert two.status_code == 201
    assert (two.json()["kcal"], two.json()["sugar"], two.json()["treat"]) == (280, 20, True)

    per100 = {"kcal": 450, "protein": 7, "carbs": 58, "fat": 20, "fiber": 5, "sugar": 26}
    label = await client.post(
        "/api/snacks",
        json=snack(per="100g", amount=45, per_unit=per100, source="label"),
        headers=auth,
    )
    assert (label.json()["kcal"], label.json()["sugar"]) == (202.5, 11.7)

    chips = await client.post("/api/snacks", json=snack(name="Chips", kind="savory"), headers=auth)
    assert chips.json()["treat"] is False
    rows = list(await session.scalars(select(FoodLog).order_by(FoodLog.id)))
    assert [r.meal_type for r in rows] == ["snack"] * 3
    assert [r.source for r in rows] == ["list", "label", "list"]


async def test_fruit_is_never_a_treat(client, auth, session):
    pear = {"kcal": 100, "protein": 0.6, "carbs": 27, "fat": 0.2, "fiber": 5.5, "sugar": 17}
    body = snack(name="Pear", emoji="🍐", kind="fruit", per_unit=pear)
    response = await client.post("/api/snacks", json=body, headers=auth)
    assert response.status_code == 201
    assert (response.json()["sugar"], response.json()["treat"]) == (17, False)

    day = (await client.get(f"/api/day?date={TODAY.isoformat()}", headers=auth)).json()
    entry = next(e for e in day["entries"] if e["name"] == "Pear")
    assert entry["snack_kind"] == "fruit"


async def test_fruit_keeps_the_day_treat_free(client, auth, session):
    from app.logs.router import is_treat

    rows = [FoodLog(kind="snack", snack_kind=k, is_reward=False) for k in ("fruit", "savory")]
    assert [is_treat(r) for r in rows] == [False, False]
    assert is_treat(FoodLog(kind="snack", snack_kind="sweet", is_reward=False))


async def test_log_scanned_snack_saves_it(client, auth, session):
    per100 = {"kcal": 539, "protein": 6.3, "carbs": 57.5, "fat": 30.9, "fiber": 0, "sugar": 56.3}
    body = snack(name="Ferrero Nutella", per="100g", amount=15, per_unit=per100, source="barcode")
    response = await client.post("/api/snacks", json=body | {"save": True}, headers=auth)
    assert response.status_code == 201
    assert response.json()["kcal"] == 80.8  # 15 g of 539 kcal / 100 g
    assert response.json()["saved_id"] is not None
    row = await session.scalar(select(FoodLog))
    assert (row.source, row.per, row.servings) == ("barcode", "100g", 15)


@pytest.mark.parametrize(
    "over",
    [
        {"amount": 0},
        {"kind": "candy"},
        {"per": "cup"},
        {"per_unit": {**COOKIE, "kcal": -1}},
        {"source": "qr"},
    ],
)
async def test_snack_validation(client, auth, over):
    assert (await client.post("/api/snacks", json=snack(**over), headers=auth)).status_code == 422


async def analyze(client, auth, session, kind, answer):
    files = {"photo": ("p.jpg", jpeg_bytes(), "image/jpeg")}
    job = (
        await client.post("/api/analyses", files=files, data={"kind": kind}, headers=auth)
    ).json()
    assert job["kind"] == kind
    settings = get_settings()
    seen: list = []
    async with httpx.AsyncClient(transport=vision_transport(answer, seen=seen)) as http:
        await run_analysis(
            session,
            job["id"],
            chain_from_settings(settings, http),
            settings.photo_dir,
            vision_max_px=settings.vision_max_px,
        )
    return (await client.get(f"/api/analyses/{job['id']}", headers=auth)).json(), seen


async def test_snack_photo_analysis(client, auth, session):
    answer = {
        "name": "Chocolate chip cookie",
        "kind": "sweet",
        "unit": "piece",
        "amount": 2,
        "values": COOKIE,
    }
    job, seen = await analyze(client, auth, session, "snack", answer)
    assert job["status"] == "done" and job["result"] is None
    assert job["snack"] == {
        "name": "Chocolate chip cookie",
        "kind": "sweet",
        "per": "piece",
        "amount": 2,
        "per_unit": COOKIE,
    }
    assert "values for ONE piece" in seen[0].content.decode()


async def test_snack_photo_of_fruit(client, auth, session):
    pear = {"kcal": 100, "protein": 0.6, "carbs": 27, "fat": 0.2, "fiber": 5.5, "sugar": 17}
    answer = {"name": "Pear", "kind": "fruit", "unit": "piece", "amount": 1, "values": pear}
    job, seen = await analyze(client, auth, session, "snack", answer)
    assert job["snack"]["kind"] == "fruit"
    sent = seen[0].content.decode()
    assert '"fruit"' in sent  # in the answer schema the model must follow
    assert "fresh or dried fruit" in sent  # and explained in the prompt


async def test_label_analysis_suggests_a_portion(client, auth, session):
    per100 = {"kcal": 450, "protein": 7, "carbs": 58, "fat": 20, "fiber": 5, "sugar": 26}
    answer = {
        "name": "Oat bar",
        "kind": "sweet",
        "values_per_grams": 100,
        "values_unit": "g",
        "values": per100,
    }
    job, seen = await analyze(client, auth, session, "label", answer)
    assert job["snack"] == {
        "name": "Oat bar",
        "kind": "sweet",
        "per": "100g",
        "amount": 45,
        "per_unit": per100,
    }
    assert "values_per_grams" in seen[0].content.decode()


async def test_label_values_per_serving_are_normalised_to_100g(client, auth, session):
    """Labels often print values per serving (e.g. "200 g, a glass"): convert to per 100 g."""
    per200 = {"kcal": 133.6, "protein": 6, "carbs": 9.4, "fat": 8, "fiber": 0, "sugar": 0}
    answer = {
        "name": "Ryazhenka",
        "kind": "drink",
        "values_per_grams": 200,
        "values_unit": "g",
        "values": per200,
    }
    job, seen = await analyze(client, auth, session, "label", answer)
    assert job["snack"]["per_unit"] == {
        "kcal": 66.8,
        "protein": 3,
        "carbs": 4.7,
        "fat": 4,
        "fiber": 0,
        "sugar": 0,
    }
    assert job["snack"]["amount"] == 200  # suggest the serving the label is printed for
    assert "daily value" in seen[0].content.decode()


async def test_spooned_snack_is_counted_in_grams(client, auth, session):
    """Chia pudding is eaten from a jar: grams with values per 100 g, not "1 piece"."""
    per100 = {"kcal": 160, "protein": 5, "carbs": 15, "fat": 8, "fiber": 7, "sugar": 8}
    answer = {"name": "Chia pudding", "kind": "sweet", "unit": "g", "amount": 200, "values": per100}
    job, seen = await analyze(client, auth, session, "snack", answer)
    assert (job["snack"]["per"], job["snack"]["amount"]) == ("100g", 200)
    assert job["snack"]["per_unit"] == per100
    sent = seen[0].content.decode()
    assert "pudding" in sent and '"ml"' in sent  # explained, and in the answer schema


async def test_drink_photo_is_counted_in_ml(client, auth, session):
    cola = {"kcal": 42, "protein": 0, "carbs": 10.6, "fat": 0, "fiber": 0, "sugar": 10.6}
    answer = {"name": "Cola", "kind": "drink", "unit": "ml", "amount": 330, "values": cola}
    job, _ = await analyze(client, auth, session, "snack", answer)
    assert (job["snack"]["per"], job["snack"]["amount"]) == ("100ml", 330)


async def test_label_per_100_ml_suggests_a_glass(client, auth, session):
    per100 = {"kcal": 42, "protein": 0, "carbs": 10.6, "fat": 0, "fiber": 0, "sugar": 10.6}
    answer = {"name": "Cola", "kind": "drink", "values_per_grams": 100, "values_unit": "ml",
              "values": per100}  # fmt: skip
    job, seen = await analyze(client, auth, session, "label", answer)
    assert (job["snack"]["per"], job["snack"]["amount"]) == ("100ml", 250)
    assert "values_unit" in seen[0].content.decode()


async def test_ml_snack_scales_like_grams(client, auth):
    cola = {"kcal": 42, "protein": 0, "carbs": 10.6, "fat": 0, "fiber": 0, "sugar": 10.6}
    body = snack(name="Cola", kind="drink", per="100ml", amount=330, per_unit=cola)
    logged = await client.post("/api/snacks", json=body, headers=auth)
    assert logged.status_code == 201, logged.text
    assert (logged.json()["kcal"], logged.json()["sugar"]) == (138.6, 35)
    bad = await client.post("/api/snacks", json=body | {"per": "100l"}, headers=auth)
    assert bad.status_code == 422


async def test_unknown_analysis_kind_rejected(client, auth):
    files = {"photo": ("p.jpg", jpeg_bytes(), "image/jpeg")}
    bad = await client.post("/api/analyses", files=files, data={"kind": "pizza"}, headers=auth)
    assert bad.status_code == 422


def log(user_id, day, treat=False, reward=False):
    return FoodLog(
        household_id=1,
        user_id=user_id,
        eaten_on=day,
        meal_type="snack" if treat or reward else "lunch",
        name="x",
        source="list",
        kind="snack" if treat or reward else "meal",
        snack_kind="sweet" if treat or reward else None,
        is_reward=reward,
        kcal=100,
    )


async def test_rewards_count_logged_treat_free_days(client, auth, session):
    # 5 days with meals; a treat on one of them; one day without any logging
    for i in (1, 2, 3, 5, 6):
        session.add(log(1, TODAY - timedelta(days=i)))
    session.add(log(1, TODAY - timedelta(days=2), treat=True))
    session.add(log(1, TODAY, treat=True))  # today never counts
    await session.commit()

    me = (await client.get(f"/api/rewards?today={TODAY.isoformat()}", headers=auth)).json()[0]
    # free days: 1, 3, 5, 6 → 4 → 2 croissants at 2 per croissant (cap 3)
    assert {
        k: me[k] for k in ("treat_free_days", "earned", "used", "available", "progress", "per")
    } == {
        "treat_free_days": 4,
        "earned": 2,
        "used": 0,
        "available": 2,
        "progress": 0,
        "per": 2,
    }


async def test_use_reward_and_cap(client, auth, session):
    await client.patch("/api/household", json={"reward_cap": 1}, headers=auth)
    for i in range(1, 5):
        session.add(log(1, TODAY - timedelta(days=i)))
    await session.commit()

    used = await client.post("/api/rewards/use", json={"today": TODAY.isoformat()}, headers=auth)
    me = used.json()[0]
    assert (me["earned"], me["used"], me["available"]) == (1, 1, 0)  # capped at 1 per week
    again = await client.post("/api/rewards/use", json={"today": TODAY.isoformat()}, headers=auth)
    assert again.status_code == 409

    croissant = (await session.scalars(select(FoodLog).where(FoodLog.is_reward))).one()
    assert (croissant.name, croissant.kcal, croissant.eaten_on) == (
        "Croissant (reward)",
        230,
        TODAY,
    )
    day = (await client.get(f"/api/insights?end={TODAY.isoformat()}", headers=auth)).json()
    assert day["members"][0]["days"][-1]["treats"] == 0  # a reward isn't a treat


async def test_rewards_list_every_member(client, auth):
    code = (await client.get("/api/auth/me", headers=auth)).json()["household"]["invite_code"]
    await register(client, email="p@example.com", name="Partner", invite_code=code)
    rewards = (await client.get(f"/api/rewards?today={TODAY.isoformat()}", headers=auth)).json()
    assert [r["name"] for r in rewards] == ["Tomi", "Partner"]
    assert rewards[1]["available"] == 0
