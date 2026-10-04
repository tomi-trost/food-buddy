from datetime import UTC, datetime, timedelta

from app.auth.security import create_access_token, decode_access_token
from tests.conftest import register


async def test_register_creates_household_and_returns_token(client):
    headers = await register(client, household_name="Our kitchen")
    me = (await client.get("/api/auth/me", headers=headers)).json()
    assert me["email"] == "tomi@example.com"
    assert me["household"]["name"] == "Our kitchen"
    assert len(me["household"]["invite_code"]) >= 6


async def test_partner_joins_with_invite_code(client):
    owner = await register(client)
    code = (await client.get("/api/auth/me", headers=owner)).json()["household"]["invite_code"]

    partner = await register(client, email="partner@example.com", invite_code=code)
    me_owner = (await client.get("/api/auth/me", headers=owner)).json()
    me_partner = (await client.get("/api/auth/me", headers=partner)).json()
    assert me_partner["household"]["id"] == me_owner["household"]["id"]


async def test_register_rejects_unknown_invite_code(client):
    response = await client.post(
        "/api/auth/register",
        json={"email": "a@example.com", "password": "12345678", "name": "A", "invite_code": "nope"},
    )
    assert response.status_code == 400


async def test_register_needs_exactly_one_household_option(client):
    base = {"email": "a@example.com", "password": "12345678", "name": "A"}
    neither = await client.post("/api/auth/register", json=base)
    both = await client.post(
        "/api/auth/register", json=base | {"household_name": "H", "invite_code": "x"}
    )
    assert neither.status_code == 422
    assert both.status_code == 422


async def test_register_rejects_short_password_and_duplicate_email(client):
    short = await client.post(
        "/api/auth/register",
        json={"email": "a@example.com", "password": "short", "name": "A", "household_name": "H"},
    )
    assert short.status_code == 422

    await register(client)
    dup = await client.post(
        "/api/auth/register",
        json={
            "email": "TOMI@example.com",
            "password": "12345678",
            "name": "T",
            "household_name": "H",
        },
    )
    assert dup.status_code == 409


async def test_login_is_case_insensitive_and_rejects_wrong_password(client):
    await register(client)
    ok = await client.post(
        "/api/auth/login", json={"email": "Tomi@Example.com", "password": "correct horse"}
    )
    assert ok.status_code == 200
    assert ok.json()["token_type"] == "bearer"

    wrong = await client.post(
        "/api/auth/login", json={"email": "tomi@example.com", "password": "wrong horse"}
    )
    unknown = await client.post(
        "/api/auth/login", json={"email": "nobody@example.com", "password": "correct horse"}
    )
    assert wrong.status_code == unknown.status_code == 401


async def test_me_requires_valid_token(client):
    assert (await client.get("/api/auth/me")).status_code == 401
    bad = await client.get("/api/auth/me", headers={"Authorization": "Bearer garbage"})
    assert bad.status_code == 401


def test_expired_token_is_rejected():
    old = create_access_token(1, now=datetime.now(UTC) - timedelta(days=365))
    assert decode_access_token(old) is None
    assert decode_access_token(create_access_token(42)) == 42


async def test_me_includes_goals_colour_and_members(client):
    owner = await register(client)
    code = (await client.get("/api/auth/me", headers=owner)).json()["household"]["invite_code"]
    await register(client, email="partner@example.com", name="Partner", invite_code=code)

    me = (await client.get("/api/auth/me", headers=owner)).json()
    assert me["goals"] == {"kcal": 2200, "protein": 110, "fiber": 30, "sugar": 50}
    assert me["household"]["reward_per"] == 2
    assert me["household"]["reward_cap"] == 3
    members = me["household"]["members"]
    assert [m["name"] for m in members] == ["Tomi", "Partner"]
    # first two members get the mock's two avatar colours
    assert [m["color"] for m in members] == ["#b9532f", "#5d8582"]
    assert me["color"] == "#b9532f"


async def test_update_goals_and_name(client, auth):
    response = await client.patch(
        "/api/auth/me", json={"goal_kcal": 2000, "goal_fiber": 35, "name": "T"}, headers=auth
    )
    assert response.status_code == 200
    body = response.json()
    assert body["goals"]["kcal"] == 2000
    assert body["goals"]["fiber"] == 35
    assert body["goals"]["protein"] == 110  # untouched
    assert body["name"] == "T"


async def test_update_goals_rejects_out_of_range(client, auth):
    for payload in ({"goal_kcal": 100}, {"goal_sugar": -1}, {"name": ""}):
        response = await client.patch("/api/auth/me", json=payload, headers=auth)
        assert response.status_code == 422, payload


async def test_household_reward_settings_shared_by_members(client):
    owner = await register(client)
    code = (await client.get("/api/auth/me", headers=owner)).json()["household"]["invite_code"]
    partner = await register(client, email="partner@example.com", invite_code=code)

    response = await client.patch(
        "/api/household", json={"reward_per": 3, "reward_cap": 1}, headers=partner
    )
    assert response.status_code == 200
    me = (await client.get("/api/auth/me", headers=owner)).json()
    assert (me["household"]["reward_per"], me["household"]["reward_cap"]) == (3, 1)

    bad = await client.patch("/api/household", json={"reward_per": 7}, headers=owner)
    assert bad.status_code == 422


async def test_profile_endpoints_require_auth(client):
    assert (await client.patch("/api/auth/me", json={})).status_code == 401
    assert (await client.patch("/api/household", json={})).status_code == 401
