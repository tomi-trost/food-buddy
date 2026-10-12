import pytest


async def test_health_checks_database(client):
    response = await client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


async def test_reauth_sends_the_page_back_to_where_it_was(client):
    response = await client.get("/api/reauth", params={"next": "/meals/3?tab=x"})
    assert response.status_code == 303
    assert response.headers["location"] == "/meals/3?tab=x"
    assert response.headers["cache-control"] == "no-store"


@pytest.mark.parametrize(
    "target", [None, "", "https://evil.example", "//evil.example", "/\\evil.example", "meals"]
)
async def test_reauth_only_redirects_within_the_app(client, target):
    params = {} if target is None else {"next": target}
    response = await client.get("/api/reauth", params=params)
    assert response.status_code == 303
    assert response.headers["location"] == "/"
