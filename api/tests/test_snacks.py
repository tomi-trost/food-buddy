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


async def test_catalog_is_the_mock_list(client, auth):
    items = (await client.get("/api/snacks/catalog", headers=auth)).json()
    assert len(items) == 10
    assert {i["kind"] for i in items} == {"sweet", "savory", "drink"}
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


@pytest.mark.parametrize(
    "over", [{"amount": 0}, {"kind": "candy"}, {"per": "cup"}, {"per_unit": {**COOKIE, "kcal": -1}}]
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
            session, job["id"], chain_from_settings(settings, http), settings.photo_dir
        )
    return (await client.get(f"/api/analyses/{job['id']}", headers=auth)).json(), seen


async def test_snack_photo_analysis(client, auth, session):
    answer = {"name": "Chocolate chip cookie", "kind": "sweet", "pieces": 2, "per_piece": COOKIE}
    job, seen = await analyze(client, auth, session, "snack", answer)
    assert job["status"] == "done" and job["result"] is None
    assert job["snack"] == {
        "name": "Chocolate chip cookie",
        "kind": "sweet",
        "per": "piece",
        "amount": 2,
        "per_unit": COOKIE,
    }
    assert "ONE piece" in seen[0].content.decode()


async def test_label_analysis_suggests_a_portion(client, auth, session):
    per100 = {"kcal": 450, "protein": 7, "carbs": 58, "fat": 20, "fiber": 5, "sugar": 26}
    answer = {"name": "Oat bar", "kind": "sweet", "values_per_grams": 100, "values": per100}
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
    answer = {"name": "Ryazhenka", "kind": "drink", "values_per_grams": 200, "values": per200}
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
