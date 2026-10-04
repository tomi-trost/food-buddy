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
