import pytest

from app.nutrition.matching import match_ingredient, normalize
from app.nutrition.seed import seed_mock


def test_normalize():
    assert normalize("  Cooked   RICE ") == "cooked rice"


@pytest.mark.parametrize(
    ("query", "expected"),
    [
        ("Chicken breast", "Chicken breast"),  # exact name, any case
        ("cooked rice", "Rice (cooked)"),  # alias
        ("grilled chicken breast", "Chicken breast"),  # name inside a longer phrase
        ("broccoli florets", "Broccoli"),
        ("cherry tomatoes", "Tomatoes"),
        ("extra virgin olive oil", "Olive oil"),
        ("basmati rice", "Rice (cooked)"),  # alias "rice" inside the phrase
        ("red onion", "Onions"),
    ],
)
async def test_matches(seeded, query, expected):
    match = await match_ingredient(seeded, query)
    assert match is not None
    assert match.ingredient.name == expected


async def test_exact_match_scores_one(seeded):
    match = await match_ingredient(seeded, "pasta")
    assert match.ingredient.name == "Spaghetti"
    assert match.score == 1.0


@pytest.mark.parametrize("query", ["mystery sauce", "hot sauce", "tofu"])
async def test_sharing_one_word_is_not_a_match(seeded, query):
    assert await match_ingredient(seeded, query) is None


async def test_unknown_or_empty_returns_none(seeded):
    assert await match_ingredient(seeded, "xylophone") is None
    assert await match_ingredient(seeded, "   ") is None


async def test_seed_is_idempotent(seeded):
    await seed_mock(seeded)
    match = await match_ingredient(seeded, "banana")
    assert match.ingredient.name == "Banana"


async def test_seed_carries_mock_metadata(seeded):
    match = await match_ingredient(seeded, "chickpeas")
    ing = match.ingredient
    assert (ing.emoji, ing.category, ing.price_per_100g, ing.shelf_days) == (
        "🫘",
        "Pantry",
        0.25,
        200,
    )
    assert ing.location == "pantry"
    chicken = (await match_ingredient(seeded, "chicken breast")).ingredient
    assert chicken.location == "fridge"
