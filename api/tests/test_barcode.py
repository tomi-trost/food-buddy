"""Open Food Facts barcode lookup: GET /api/barcode/{code}, cached in off_product."""

from datetime import UTC, datetime, timedelta

import httpx
import pytest
from sqlalchemy import update

from app.barcode import service
from app.barcode.models import OffProduct
from tests.conftest import register
from tests.test_analysis_queue import partner_of

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
        "kind": "sweet",  # 56 g sugar per 100 g
        "remembered": False,
        "source": "Open Food Facts",
    }
    assert off[0].url.path == f"/api/v2/product/{CODE}.json"
    assert "nutriments" in off[0].url.params["fields"]
    assert "categories_tags" in off[0].url.params["fields"]


@pytest.mark.parametrize(
    ("categories", "sugar", "kind"),
    [
        (["en:beverages", "en:sodas"], 10.6, "drink"),
        (["en:beverages", "en:waters"], 0, "drink"),  # the user switches water off "treat"
        (["en:snacks", "en:sweet-snacks", "en:biscuits-and-cakes"], 8, "sweet"),
        (["en:snacks", "en:salty-snacks", "en:crisps"], 0.5, "savory"),
        (["en:plant-based-foods", "en:fruits", "en:fresh-fruits"], 10, "fruit"),
        (["en:dried-fruits", "en:dates"], 66, "fruit"),  # sugary, still fruit
        (["en:fruits", "en:sweet-spreads", "en:jams"], 50, "sweet"),  # jam is a sweet
        (["en:beverages", "en:fruit-juices"], 9, "drink"),
        ([], 22, "sweet"),  # no categories: the sugar decides
        ([], 14.9, "savory"),
    ],
)
async def test_snack_kind_is_guessed(client, auth, off, categories, sugar, kind):
    nutriments = {"energy-kcal_100g": 100, "sugars_100g": sugar}
    off.set(product={**OFF_PRODUCT, "categories_tags": categories, "nutriments": nutriments})
    assert (await client.get(f"/api/barcode/{CODE}", headers=auth)).json()["kind"] == kind


def test_snack_kind_without_values_is_savory():
    assert service.snack_kind([], None) == "savory"
    assert service.snack_kind(["en:chocolates"], None) == "sweet"


async def test_answer_cached_before_kind_existed_still_gets_one(client, auth, off, session):
    old = service.product_of(OFF_PRODUCT)
    del old["kind"]
    session.add(OffProduct(code=CODE, product=old, fetched_at=datetime.now(UTC)))
    await session.commit()
    body = (await client.get(f"/api/barcode/{CODE}", headers=auth)).json()
    assert body["kind"] == "sweet"
    assert off == []  # served from the cache


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


# --- our corrected products -------------------------------------------------------------

FIXED = {"kcal": 545, "protein": 6.3, "carbs": 57.5, "fat": 31, "fiber": 3.4, "sugar": 56.3}


def scanned(**over):
    return {
        "eaten_on": "2026-10-13",
        "name": "Nutella (ours)",
        "emoji": "🍪",
        "kind": "sweet",
        "source": "barcode",
        "per": "100g",
        "amount": 20,
        "per_unit": FIXED,
        "barcode": CODE,
    } | over


async def test_logged_scan_is_remembered_and_used_next_time(client, auth, off):
    await client.get(f"/api/barcode/{CODE}", headers=auth)  # OFF answer cached
    assert (await client.post("/api/snacks", json=scanned(), headers=auth)).status_code == 201

    body = (await client.get(f"/api/barcode/{CODE}", headers=auth)).json()
    assert body == {
        "code": CODE,
        "name": "Nutella (ours)",
        "brand": "",
        "quantity": "400 g",  # still from OFF's cached answer
        "serving_g": 20.0,  # what we ate last time
        "image_url": "https://images.openfoodfacts.org/nutella.jpg",
        "per100": {k: float(v) for k, v in FIXED.items()},
        "kind": "sweet",
        "remembered": True,
        "source": "Our values",
    }
    assert len(off) == 1  # ours: OFF not asked again

    # logging it again updates it (last one wins)
    again = scanned(name="Nutella", kind="savory", amount=15, per_unit={**FIXED, "kcal": 539})
    await client.post("/api/snacks", json=again, headers=auth)
    body = (await client.get(f"/api/barcode/{CODE}", headers=auth)).json()
    assert (body["name"], body["kind"], body["serving_g"], body["per100"]["kcal"]) == (
        "Nutella",
        "savory",
        15.0,
        539.0,
    )


async def test_product_unknown_to_off_is_found_once_typed_in(client, auth, off):
    off.set(product=None)
    assert (await client.get(f"/api/barcode/{CODE}", headers=auth)).status_code == 404
    await client.post("/api/snacks", json=scanned(name="Market granola"), headers=auth)

    body = (await client.get(f"/api/barcode/{CODE}", headers=auth)).json()
    assert (body["name"], body["remembered"]) == ("Market granola", True)
    assert body["quantity"] == "" and body["image_url"] is None


async def test_remembered_products_stay_in_the_household(client, auth, off):
    await client.post("/api/snacks", json=scanned(), headers=auth)
    partner = await partner_of(client, auth)
    assert (await client.get(f"/api/barcode/{CODE}", headers=partner)).json()["remembered"] is True

    stranger = await register(client, email="x@example.com", name="X")
    body = (await client.get(f"/api/barcode/{CODE}", headers=stranger)).json()
    assert (body["name"], body["remembered"]) == ("Nutella", False)  # OFF's


@pytest.mark.parametrize(
    "over",
    [
        {"barcode": "12345"},
        {"barcode": "8000500310427x"},
        {"source": "list"},  # a barcode only with a scanned snack
        {"per": "piece"},
    ],
)
async def test_barcode_on_a_snack_is_validated(client, auth, over):
    response = await client.post("/api/snacks", json=scanned(**over), headers=auth)
    assert response.status_code == 422


async def test_scanned_snack_without_barcode_is_not_remembered(client, auth, off):
    body = scanned()
    del body["barcode"]
    assert (await client.post("/api/snacks", json=body, headers=auth)).status_code == 201
    assert (await client.get(f"/api/barcode/{CODE}", headers=auth)).json()["remembered"] is False
