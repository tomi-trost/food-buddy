"""The full USDA SR Legacy + Ciqual import (decision 0022): generated short names, the committed
data file, seeding, exact-only matching and search ranking."""

import importlib.util
from pathlib import Path

import pytest
from sqlalchemy import func, select

from app.nutrition.matching import match_ingredient, normalize
from app.nutrition.models import Ingredient
from app.nutrition.seed import (
    CATALOG_SOURCES,
    MOCK_INGREDIENTS,
    catalog,
    full_foods,
    seed_catalog,
    seed_full,
    seed_mock,
)
from tests.conftest import register

_spec = importlib.util.spec_from_file_location(
    "build_catalog", Path(__file__).parents[1] / "scripts" / "build_catalog.py"
)
build = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(build)


# --- short names ------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("description", "eaten_cooked", "expected"),
    [
        ("Blackberries, raw", False,
         {"blackberries", "blackberry", "raw blackberries", "raw blackberry"}),
        ("Cheese, swiss", False, {"swiss cheese", "swiss cheeses"}),
        ("Oil, coconut", False, {"coconut oil", "coconut oils"}),
        ("Spices, cumin seed", False, {"cumin seed", "cumin seeds"}),  # heading dropped
        ("Brownie (chocolate cake)", False, {"brownie", "brownies"}),  # parentheses dropped
        # meat, fish, grains, legumes: the plain name only from a cooked row
        ("Mullet, roasted/baked", True, {"mullet", "mullets", "cooked mullet", "cooked mullets"}),
        ("Lamb, neck, raw", True, {"raw neck lamb", "raw neck lambs"}),
        # vegetables: the plain name from the raw row, the cooked row only as "cooked …"
        ("Okra, cooked, boiled, drained, without salt", False,
         {"cooked okra", "cooked okras", "boiled okra", "boiled okras"}),
    ],
)  # fmt: skip
def test_short_names(description, eaten_cooked, expected):
    assert build.short_names(description, eaten_cooked) == expected


@pytest.mark.parametrize(
    "description",
    [
        'Beef, rib, eye, small end (ribs 10-12), separable lean only, trimmed to 0" fat, raw',
        "Soup, chicken noodle, canned, condensed",  # too specific: three parts left
        "Fat, beef tallow, with 0.1% added antioxidant",  # digits and symbols
    ],
)
def test_too_specific_rows_get_no_short_name(description):
    assert build.short_names(description, eaten_cooked=False) == set()


def test_variants_make_singular_and_plural():
    assert build._variants("potatoes") == {"potatoes", "potato"}
    assert build._variants("cherry") == {"cherry", "cherries"}
    assert build._variants("swiss cheese") == {"swiss cheese", "swiss cheeses"}
    assert build._variants("couscous") == {"couscous", "couscou"}  # harmless, nobody types it


def test_a_name_covered_by_a_hand_picked_row_is_dropped():
    terms = {"brown rice", "olive oil"}
    assert build._covered("brown rice", terms)
    assert build._covered("cooked brown rice", terms)
    assert not build._covered("coconut oil", terms)
    assert not build._covered("fried olive oil", terms)  # "fried" isn't a cooking state we strip


# --- the committed data file --------------------------------------------------------------


@pytest.fixture(scope="module")
def rows() -> list[dict]:
    return full_foods()


def curated_terms() -> set[str]:
    terms = {normalize(t) for i in MOCK_INGREDIENTS for t in (i.name, *i.aliases)}
    for source in CATALOG_SOURCES:
        terms |= {normalize(t) for r in catalog(source) for t in (r["name"], *r["aliases"])}
    return terms


def test_full_file_holds_both_sources(rows):
    sources = {r["source"] for r in rows}
    assert sources == {"usda", "ciqual"}
    assert sum(r["source"] == "usda" for r in rows) > 6000
    assert sum(r["source"] == "ciqual" for r in rows) > 2500
    assert sum(bool(r["aliases"]) for r in rows) > 1500


def test_full_rows_are_sane(rows):
    for r in rows:
        assert r["category"] in {"Meat", "Produce", "Dairy", "Pantry"}, r["name"]
        assert r["emoji"] and r["shelf_days"] > 0 and r["ref"], r["name"]
        assert all(r[k] >= 0 for k in ("kcal", "protein", "carbs", "fat", "fiber", "sugar"))
        assert r["kcal"] <= 902, r["name"]  # per 100 g; pure fat is ~900
        assert not r["curated"]


def test_full_rows_never_repeat_or_shadow_the_hand_picked_ones(rows):
    keys = [(r["source"], r["name"].lower()) for r in rows]
    assert len(keys) == len(set(keys))
    picked = [r for s in CATALOG_SOURCES for r in catalog(s)]
    assert not {(r["source"], r["ref"]) for r in picked} & {(r["source"], r["ref"]) for r in rows}
    assert not {(r["source"], r["name"].lower()) for r in picked} & set(keys)


def test_full_short_names_point_to_one_row_and_never_to_a_hand_picked_term(rows):
    seen: dict[str, str] = {}
    picked = curated_terms()
    for r in rows:
        for a in r["aliases"]:
            assert a == normalize(a), a
            assert a not in seen, f"{a!r}: {seen.get(a)} and {r['name']}"
            assert a not in picked, a
            seen[a] = r["name"]


def test_baby_food_brands_and_bottled_water_are_left_out(rows):
    names = [r["name"].lower() for r in rows]
    assert not any(n.startswith("babyfood") for n in names)
    ciqual = [r["name"].lower() for r in rows if r["source"] == "ciqual"]
    assert not any("mineral" in n and "water" in n for n in ciqual)  # ~100 brands of water
    # USDA brands (KRAFT, McDONALD'S): searchable, never matched. Ciqual's caps are "PDO", "UHT".
    branded = [r for r in rows if r["source"] == "usda" and build.BRAND.search(r["name"])]
    assert branded and all(not r["aliases"] for r in branded)


# --- seeding, matching, search ------------------------------------------------------------

MACROS = dict(kcal=50, protein=1, carbs=10, fat=0)


async def test_seed_full_is_idempotent_and_not_curated(session):
    await seed_full(session)
    count = await session.scalar(select(func.count()).select_from(Ingredient))
    await seed_full(session)
    assert await session.scalar(select(func.count()).select_from(Ingredient)) == count
    assert count == len(full_foods())
    assert not await session.scalar(select(func.bool_or(Ingredient.curated)))


async def test_hand_picked_rows_stay_curated_with_their_reference(session):
    await seed_mock(session)
    await seed_catalog(session)
    zucchini = await session.scalar(select(Ingredient).where(Ingredient.name == "Zucchini"))
    banana = await session.scalar(select(Ingredient).where(Ingredient.name == "Banana"))
    assert zucchini.curated and zucchini.ref == "169291"
    assert banana.curated and banana.ref == ""  # mock


async def test_imported_rows_match_only_exactly(session):
    session.add(
        Ingredient(
            name="Quandong, raw", source="usda", aliases=["quandong"], curated=False, **MACROS
        )
    )
    await session.commit()
    assert (await match_ingredient(session, "Quandong")).ingredient.name == "Quandong, raw"
    assert (await match_ingredient(session, "quandong, raw")).score == 1.0  # full name too
    assert await match_ingredient(session, "sliced quandong") is None  # no fuzzy on imports
    assert await match_ingredient(session, "quandongs") is None


async def test_hand_picked_exact_beats_imported_exact(session):
    session.add_all(
        [
            Ingredient(
                name="Oil, olive", source="usda", aliases=["olive oil"], curated=False, **MACROS
            ),
            Ingredient(name="Olive oil", source="mock", **MACROS),
        ]
    )
    await session.commit()
    assert (await match_ingredient(session, "olive oil")).ingredient.source == "mock"


async def test_imported_exact_beats_hand_picked_fuzzy(session):
    session.add_all(
        [
            Ingredient(name="Coconut", source="usda", **MACROS),
            Ingredient(
                name="Oil, coconut", source="usda", aliases=["coconut oil"], curated=False, **MACROS
            ),
        ]
    )
    await session.commit()
    assert (await match_ingredient(session, "coconut oil")).ingredient.name == "Oil, coconut"
    # without the exact name, the hand-picked row still answers fuzzily
    assert (await match_ingredient(session, "grated coconut")).ingredient.name == "Coconut"


async def test_search_lists_hand_picked_foods_before_the_import(client, session):
    session.add_all(
        [
            Ingredient(name="Cherries, sour, red, raw", source="usda", curated=False, **MACROS),
            Ingredient(name="Cherry tomatoes", source="usda", **MACROS),
        ]
    )
    await session.commit()
    auth = await register(client)
    names = [i["name"] for i in (await client.get("/api/ingredients?q=cher", headers=auth)).json()]
    assert names == ["Cherry tomatoes", "Cherries, sour, red, raw"]
    everything = [i["name"] for i in (await client.get("/api/ingredients", headers=auth)).json()]
    assert everything == ["Cherry tomatoes", "Cherries, sour, red, raw"]
