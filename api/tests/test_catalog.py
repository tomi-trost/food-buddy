import pytest
from sqlalchemy import select

from app.nutrition.matching import match_ingredient, normalize
from app.nutrition.models import Ingredient
from app.nutrition.seed import CATALOG_SOURCES, MOCK_INGREDIENTS, catalog, seed_catalog, seed_mock

CATEGORIES = {"Meat", "Produce", "Dairy", "Pantry"}


@pytest.fixture
async def full(session):
    """Both seeds, like production."""
    await seed_mock(session)
    await seed_catalog(session)
    return session


ALCOHOL = {"Beer", "Wine"}  # energy mostly from alcohol, not macros


def all_rows() -> list[dict]:
    return [r for source in CATALOG_SOURCES for r in catalog(source)]


def kcal_from_macros(r: dict) -> float:
    """EU label factors. USDA carbs are "by difference" and include fiber; Ciqual's don't."""
    carbs = r["carbs"] - r["fiber"] if r["source"] == "usda" else r["carbs"]
    return 4 * r["protein"] + 4 * carbs + 9 * r["fat"] + 2 * r["fiber"]


def test_catalog_rows_are_sane():
    assert len(catalog("usda")) >= 150
    assert len(catalog("ciqual")) >= 40
    for r in all_rows():
        assert r["category"] in CATEGORIES, r["name"]
        assert r["emoji"], r["name"]
        assert r["shelf_days"] > 0, r["name"]
        assert all(r[k] >= 0 for k in ("kcal", "protein", "carbs", "fat", "fiber", "sugar"))
        assert r["kcal"] <= 900, r["name"]  # per 100 g; pure fat is ~884
        assert r["protein"] + r["carbs"] + r["fat"] <= 100.5, r["name"]
        # energy agrees with the macros (EU label factors), so no column got mixed up
        if r["name"] not in ALCOHOL:
            estimate = kcal_from_macros(r)
            assert abs(r["kcal"] - estimate) <= max(25, 0.15 * r["kcal"]), (r["name"], estimate)
        assert r["sugar"] <= r["carbs"] + 0.5, r["name"]
        assert all(a == normalize(a) for a in r["aliases"]), r["name"]


def test_every_name_and_alias_points_to_one_ingredient():
    """An exact term shared by two rows would make matching depend on row order."""
    owners: dict[str, str] = {}
    mock = [(i.name, i.aliases) for i in MOCK_INGREDIENTS]
    catalogs = [(r["name"], r["aliases"]) for r in all_rows()]
    for name, aliases in mock + catalogs:
        for term in {normalize(name), *aliases}:
            assert term not in owners, f"{term!r}: {owners.get(term)} and {name}"
            owners[term] = name


@pytest.mark.parametrize(
    ("query", "expected"),
    [
        ("zucchini", "Zucchini"),  # the pasta photo from 2026-10-12
        ("Courgettes", "Zucchini"),
        ("sauteed zucchini slices", "Zucchini"),
        ("pesto", "Pesto"),
        ("basil pesto", "Pesto"),
        ("fresh basil leaves", "Basil"),
        ("ground black pepper", "Black pepper"),  # not "Bell pepper"
        ("red bell pepper", "Bell pepper"),
        ("canned tuna", "Tuna"),
        ("fusilli", "Penne"),
        ("feta cheese", "Feta"),
        ("tomato sauce", "Tomato sauce"),
        # the mock rows still win for their own terms
        ("cooked pasta", "Spaghetti"),
        ("olive oil", "Olive oil"),
        ("chopped tomatoes", "Canned tomatoes"),
        ("onion", "Onions"),
        # Ciqual: what USDA lacks
        ("mascarpone", "Mascarpone"),  # not "Cream cheese" any more
        ("prosciutto crudo", "Prosciutto"),
        ("potato gnocchi", "Gnocchi"),
        ("tagliatelle", "Egg pasta"),
        ("polenta", "Polenta"),
        ("oat milk", "Oat milk"),
        ("ragù", "Bolognese sauce"),
        ("grana padano", "Grana Padano"),
        ("pecorino romano", "Pecorino"),
    ],
)
async def test_model_names_match_the_catalog(full, query, expected):
    match = await match_ingredient(full, query)
    assert match is not None, query
    assert match.ingredient.name == expected


@pytest.mark.parametrize("query", ["mystery sauce", "xylophone", "burrata"])
async def test_still_no_guessing(full, query):
    assert await match_ingredient(full, query) is None


async def test_catalog_seed_is_idempotent_and_marked_by_source(full):
    await seed_catalog(full)
    pestos = list(await full.scalars(select(Ingredient).where(Ingredient.name == "Pesto")))
    assert len(pestos) == 1
    pesto = pestos[0]
    assert (pesto.source, pesto.kcal, pesto.fat) == ("usda", 418, 37.6)
    assert (pesto.category, pesto.location, pesto.price_per_100g) == ("Pantry", "pantry", 0)
    gnocchi = (await match_ingredient(full, "gnocchi")).ingredient
    assert (gnocchi.source, gnocchi.kcal) == ("ciqual", 177)
