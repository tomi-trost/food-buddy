"""Open Food Facts barcode lookup: GET /api/barcode/{code}, cached in off_product."""

from datetime import UTC, datetime, timedelta

import httpx
import pytest
from sqlalchemy import update

from app.barcode import service
from app.barcode.models import OffProduct

CODE = "8000500310427"  # a 400 g jar of hazelnut spread
OFF_PRODUCT = {
    "product_name": "Nutella",
    "brands": "Ferrero, Nutella",
    "quantity": "400 g",
    "serving_quantity": "15",
    "image_front_small_url": "https://images.openfoodfacts.org/nutella.jpg",
    "nutriments": {
        "energy-kcal_100g": 539,
        "proteins_100g": 6.3,
        "carbohydrates_100g": 57.5,
        "fat_100g": 30.9,
        "sugars_100g": 56.3,
        # no fibre on the label
    },
}


def off_transport(seen: list, product: dict | None = OFF_PRODUCT, status: int = 200):
    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        if status != 200:
            return httpx.Response(status, text="down")
        if product is None:
            return httpx.Response(404, json={"status": 0, "status_verbose": "product not found"})
        return httpx.Response(200, json={"status": 1, "code": CODE, "product": product})

    return httpx.MockTransport(handler)


@pytest.fixture
def off(monkeypatch):
    """Point the lookup at a fake OFF; returns the requests it got. `off.set(...)` changes it."""
    seen: list[httpx.Request] = []

    class Fake(list):
        def set(self, **kwargs):
            transport = off_transport(self, **kwargs)
            monkeypatch.setattr(
                service,
                "off_client",
                lambda: httpx.AsyncClient(
                    base_url="https://off.test",
                    transport=transport,
                    headers={"User-Agent": "FoodBuddy/test"},
                ),
            )

    fake = Fake(seen)
    fake.set()
    return fake


async def test_lookup_returns_label_values_per_100_g(client, auth, off):
    response = await client.get(f"/api/barcode/{CODE}", headers=auth)
    assert response.status_code == 200
    assert response.json() == {
        "code": CODE,
        "name": "Nutella",
        "brand": "Ferrero",
        "quantity": "400 g",
        "serving_g": 15.0,
        "image_url": "https://images.openfoodfacts.org/nutella.jpg",
        "per100": {
            "kcal": 539.0,
            "protein": 6.3,
            "carbs": 57.5,
            "fat": 30.9,
            "fiber": 0.0,
            "sugar": 56.3,
        },
        "source": "Open Food Facts",
    }
    assert off[0].url.path == f"/api/v2/product/{CODE}.json"
    assert "nutriments" in off[0].url.params["fields"]


async def test_second_lookup_comes_from_the_cache(client, auth, off):
    await client.get(f"/api/barcode/{CODE}", headers=auth)
    response = await client.get(f"/api/barcode/{CODE}", headers=auth)
    assert response.status_code == 200
    assert response.json()["name"] == "Nutella"
    assert len(off) == 1


async def test_energy_in_kj_only_is_converted(client, auth, off):
    off.set(product={**OFF_PRODUCT, "nutriments": {"energy_100g": 2255, "fat_100g": 30.9}})
    per100 = (await client.get(f"/api/barcode/{CODE}", headers=auth)).json()["per100"]
    assert per100["kcal"] == pytest.approx(538.96, abs=0.1)
    assert per100["protein"] == 0.0


async def test_product_without_energy_has_no_values(client, auth, off):
    off.set(product={"product_name": "Mystery jar", "nutriments": {"fat_100g": "n/a"}})
    body = (await client.get(f"/api/barcode/{CODE}", headers=auth)).json()
    assert body["name"] == "Mystery jar"
    assert body["brand"] == "" and body["serving_g"] is None and body["image_url"] is None
    assert body["per100"] is None  # the user types the label instead


async def test_unknown_barcode_is_404_and_cached_for_a_day(client, auth, off, session):
    off.set(product=None)
    response = await client.get(f"/api/barcode/{CODE}", headers=auth)
    assert response.status_code == 404
    assert (await client.get(f"/api/barcode/{CODE}", headers=auth)).status_code == 404
    assert len(off) == 1

    # a day later OFF is asked again (someone may have added the product)
    await session.execute(
        update(OffProduct).values(fetched_at=datetime.now(UTC) - timedelta(days=1, minutes=1))
    )
    await session.commit()
    off.set()
    assert (await client.get(f"/api/barcode/{CODE}", headers=auth)).status_code == 200


async def test_known_product_is_refreshed_after_30_days(client, auth, off, session):
    await client.get(f"/api/barcode/{CODE}", headers=auth)
    await session.execute(
        update(OffProduct).values(fetched_at=datetime.now(UTC) - timedelta(days=31))
    )
    await session.commit()
    off.set(product={**OFF_PRODUCT, "product_name": "Nutella (new recipe)"})
    body = (await client.get(f"/api/barcode/{CODE}", headers=auth)).json()
    assert body["name"] == "Nutella (new recipe)"


async def test_off_down_serves_a_stale_answer(client, auth, off, session):
    await client.get(f"/api/barcode/{CODE}", headers=auth)
    await session.execute(
        update(OffProduct).values(fetched_at=datetime.now(UTC) - timedelta(days=31))
    )
    await session.commit()
    off.set(status=503)
    response = await client.get(f"/api/barcode/{CODE}", headers=auth)
    assert response.status_code == 200
    assert response.json()["name"] == "Nutella"


async def test_off_down_without_cache_is_503(client, auth, off):
    off.set(status=500)
    response = await client.get(f"/api/barcode/{CODE}", headers=auth)
    assert response.status_code == 503
    assert response.json()["detail"] == "Open Food Facts can't be reached right now"


async def test_off_unreachable_is_503(client, auth, monkeypatch):
    def refuse(request):
        raise httpx.ConnectError("no route", request=request)

    monkeypatch.setattr(
        service,
        "off_client",
        lambda: httpx.AsyncClient(
            base_url="https://off.test", transport=httpx.MockTransport(refuse)
        ),
    )
    assert (await client.get(f"/api/barcode/{CODE}", headers=auth)).status_code == 503


@pytest.mark.parametrize("code", ["123", "12345678901234567", "80005003104ab", "8000500310427x"])
async def test_invalid_barcodes_are_rejected_before_asking_off(client, auth, off, code):
    assert (await client.get(f"/api/barcode/{code}", headers=auth)).status_code == 422
    assert off == []


async def test_lookup_needs_login(client, off):
    assert (await client.get(f"/api/barcode/{CODE}")).status_code == 401
    assert off == []


def test_real_client_identifies_the_app():
    client = service.off_client()
    assert client.headers["User-Agent"].startswith("FoodBuddy/")
    assert str(client.base_url).startswith("https://world.openfoodfacts.org")
