"""Products as snack meals (0025): a scanned, label or picked snack saved to our snacks becomes a
meal with one ingredient that only our household sees, holding the values per 100 g / 100 ml."""

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User
from app.meals.models import Meal, MealIngredient
from app.nutrition.models import Ingredient
from app.nutrition.units import PIECES
from app.snacks.schemas import SnackIn

PIECE_G = 30  # a piece of unknown weight: values per piece stay exact, only stock grams guess
CATEGORY = {"fruit": "Produce"}  # the rest: Pantry


def source_of(household_id: int) -> str:
    return f"h{household_id}"


def piece_weight(body: SnackIn) -> float:
    if body.piece_g:
        return body.piece_g
    return PIECES.get(body.name.strip().lower(), PIECE_G)


def per100_of(body: SnackIn) -> dict[str, float]:
    values = body.per_unit.model_dump()
    if body.per != "piece":
        return values
    weight = piece_weight(body)
    return {k: round(v * 100 / weight, 3) for k, v in values.items()}


async def by_name(session: AsyncSession, household_id: int, name: str) -> Meal | None:
    return await session.scalar(
        select(Meal)
        .where(
            Meal.household_id == household_id,
            Meal.is_product,
            func.lower(Meal.name) == name.strip().lower(),
        )
        .limit(1)
    )


async def _ingredient(session: AsyncSession, household_id: int, name: str) -> Ingredient:
    """Ours by that name (names are unique per source), else a new one."""
    found = await session.scalar(
        select(Ingredient).where(
            Ingredient.source == source_of(household_id), Ingredient.name == name
        )
    )
    if found is None:
        found = Ingredient(
            household_id=household_id, source=source_of(household_id), name=name, aliases=[]
        )
        session.add(found)
    return found


async def save_product(
    session: AsyncSession,
    user: User,
    body: SnackIn,
    photo_path: str | None,
    meal: Meal | None = None,
) -> Meal:
    """Create or update (same barcode `meal`, else same name) the product meal for what was
    just logged: its values, unit, usual amount and photo. The caller commits."""
    name = body.name.strip()
    meal = meal or await by_name(session, user.household_id, name)
    if meal is not None and not meal.is_product:
        meal = None  # turned into a recipe since: leave it alone, start a new product
    per = body.per
    piece_g = piece_weight(body) if per == "piece" else None
    usual = body.amount * piece_g if piece_g else body.amount  # grams (ml) one usually has

    if meal is None:
        ingredient = await _ingredient(session, user.household_id, name)
        meal = Meal(
            household_id=user.household_id,
            created_by=user.id,
            name=name,
            types=["snack"],
            tags=[],
            prep_minutes=1,
            portions=1,
            steps=[],
            steps_source="ours",  # nothing to cook: the model doesn't write a recipe
            is_product=True,
            ingredients=[MealIngredient(ingredient=ingredient, grams=usual)],
            components=[],  # set up front: never loaded lazily in this request
            aliases=[],
        )
        session.add(meal)
    else:
        meal.name = name
        meal.ingredients[0].grams = usual
        ingredient = meal.ingredients[0].ingredient
    for key, value in per100_of(body).items():
        setattr(ingredient, key, value)
    ingredient.emoji, ingredient.category = body.emoji, CATEGORY.get(body.kind, "Pantry")
    ingredient.unit, ingredient.unit_grams = {"piece": ("pc", piece_g), "100ml": ("ml", 1.0)}.get(
        per, (None, None)
    )
    meal.emoji, meal.snack_kind, meal.per, meal.piece_g = body.emoji, body.kind, per, piece_g
    meal.photo_path = photo_path or meal.photo_path
    await session.flush()
    return meal
