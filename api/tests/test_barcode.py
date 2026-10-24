"""Open Food Facts barcode lookup: GET /api/barcode/{code}, cached in off_product."""

from datetime import UTC, datetime, timedelta

import httpx
import pytest
from sqlalchemy import update

from app.barcode import service
from app.barcode.models import OffProduct
from tests.conftest import CODE, OFF_PRODUCT, register
from tests.test_analysis_queue import partner_of


async def test_lookup_returns_label_values_per_100_g(client, auth, off):
    response = await client.get(f"/api/barcode/{CODE}", headers=auth)
    assert response.status_code == 200
    assert response.json() == {
        "code": CODE,
        "name": "Nutella",
        "brand": "Ferrero",
        "quantity": "400 g",
        "per": "100g",
        "serving_g": 15.0,
        "piece_g": None,
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
        "meal_id": None,
        "source": "Open Food Facts",
        "ingredient": None,  # not one of our ingredients
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
        "per": "100g",
        "serving_g": 20.0,  # what we ate last time
        "piece_g": None,  # weighed, not counted
        "image_url": "https://images.openfoodfacts.org/nutella.jpg",
        "per100": {k: float(v) for k, v in FIXED.items()},
        "kind": "sweet",
        "remembered": True,
        "meal_id": None,  # not saved to our snacks
        "source": "Our values",
        "ingredient": None,
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


async def test_counted_in_pieces_is_logged_per_piece_and_remembered(client, auth, off):
    """Cookies: 3 pieces of 9 g instead of 27 g; next scan opens in pieces again."""
    per_piece = {k: round(v * 9 / 100, 3) for k, v in FIXED.items()}  # 49.05 kcal a cookie
    cookies = scanned(per="piece", amount=3, per_unit=per_piece, piece_g=9)
    response = await client.post("/api/snacks", json=cookies, headers=auth)
    assert response.status_code == 201, response.text
    assert response.json()["kcal"] == round(3 * per_piece["kcal"], 1)

    day = (await client.get("/api/day?date=2026-10-13", headers=auth)).json()
    (entry,) = day["entries"]
    assert (entry["per"], entry["servings"]) == ("piece", 3)  # edits later go in pieces too

    body = (await client.get(f"/api/barcode/{CODE}", headers=auth)).json()
    assert body["piece_g"] == 9
    assert body["serving_g"] == 27  # grams eaten = 3 × 9 g
    assert body["per100"]["kcal"] == 545  # per 100 g again, as in the pack

    # weighed the next time: the piece weight is forgotten
    await client.post("/api/snacks", json=scanned(amount=30), headers=auth)
    body = (await client.get(f"/api/barcode/{CODE}", headers=auth)).json()
    assert (body["piece_g"], body["serving_g"]) == (None, 30)


COLA = {
    "product_name": "Coca-Cola",
    "brands": "Coca-Cola",
    "quantity": "330 ml",
    "serving_quantity": "330",
    "categories_tags": ["en:beverages", "en:sodas"],
    "nutriments": {"energy-kcal_100g": 42, "carbohydrates_100g": 10.6, "sugars_100g": 10.6},
}


async def test_drink_is_counted_in_ml(client, auth, off):
    off.set(product=COLA)
    body = (await client.get(f"/api/barcode/{CODE}", headers=auth)).json()
    assert (body["per"], body["kind"], body["serving_g"]) == ("100ml", "drink", 330)

    can = scanned(name="Coca-Cola", kind="drink", per="100ml", amount=330, per_unit=body["per100"])
    logged = await client.post("/api/snacks", json=can, headers=auth)
    assert logged.status_code == 201, logged.text
    assert logged.json()["kcal"] == 138.6

    again = (await client.get(f"/api/barcode/{CODE}", headers=auth)).json()
    assert (again["remembered"], again["per"], again["serving_g"]) == (True, "100ml", 330)

    # switched to grams once: remembered that way
    await client.post("/api/snacks", json=can | {"per": "100g", "amount": 200}, headers=auth)
    again = (await client.get(f"/api/barcode/{CODE}", headers=auth)).json()
    assert (again["per"], again["serving_g"]) == ("100g", 200)


async def test_counted_drink_remembers_ml(client, auth, off):
    """Cans counted in pieces: the piece is 330 ml, values back per 100 ml."""
    off.set(product=COLA)
    per_can = {"kcal": 138.6, "protein": 0, "carbs": 35, "fat": 0, "fiber": 0, "sugar": 35}
    cans = scanned(per="piece", amount=2, per_unit=per_can, piece_g=330, piece_base="100ml")
    assert (await client.post("/api/snacks", json=cans, headers=auth)).status_code == 201
    body = (await client.get(f"/api/barcode/{CODE}", headers=auth)).json()
    assert (body["per"], body["piece_g"], body["per100"]["kcal"]) == ("100ml", 330, 42)


@pytest.mark.parametrize(
    ("quantity", "kind", "per"),
    [
        ("330 ml", "drink", "100ml"),
        ("1,5 L", "drink", "100ml"),
        ("25cl", "drink", "100ml"),
        ("400 g", "sweet", "100g"),
        ("1 kg", "drink", "100g"),  # e.g. cocoa powder filed under beverages
        ("", "drink", "100ml"),
        ("6 x", "savory", "100g"),
    ],
)
def test_measure_follows_the_pack_size(quantity, kind, per):
    assert service.measure(quantity, kind) == per


async def test_pieces_need_the_piece_weight_and_a_barcode(client, auth, off):
    bad = [
        scanned(per="piece", amount=3),  # no piece weight
        scanned(piece_g=9),  # per 100 g with a piece weight
        scanned(barcode=None, per="piece", piece_g=9, source="list"),  # not scanned
        scanned(per="piece", amount=3, piece_g=0),
        scanned(per="piece", amount=3, piece_g=1001),
    ]
    for body in bad:
        assert (await client.post("/api/snacks", json=body, headers=auth)).status_code == 422, body


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
