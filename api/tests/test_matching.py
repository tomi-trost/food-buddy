import pytest

from app.nutrition.matching import match_ingredient, normalize
from app.nutrition.seed import seed_mock


@pytest.fixture
async def seeded(session):
    await seed_mock(session)
    return session


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
