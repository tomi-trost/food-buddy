"""Bundles (#17): a plate that holds portions of other meals of ours ("dishes", e.g. our banana
pancakes) next to its own ingredients (mango, Nutella).

One level deep: a dish holds no dishes itself, and a meal that is a dish in some plate can't
hold dishes. Ratings stay on the plate. Nutrition and cost add up the dishes' values per portion;
stock, shopping and the "where it comes from" insight go through the dishes' ingredients.
"""

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User
from app.meals.models import Meal, MealAlias, MealComponent, MealIngredient
from app.meals.recipes import template_steps
from app.meals.schemas import ComponentIn, NewComponent
from app.nutrition.matching import normalize
from app.nutrition.models import Ingredient


def _unprocessable(detail: str) -> HTTPException:
    return HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, detail)


def share(mc: MealComponent) -> float:
    """The part of the dish's whole recipe that goes into the plate's whole recipe."""
    return mc.portions / mc.component.portions


def flat_items(meal: Meal) -> list[tuple[Ingredient, float]]:
    """The whole recipe as ingredients: the plate's own plus its dishes' (merged by ingredient)."""
    out: dict[int, tuple[Ingredient, float]] = {}

    def add(ingredient: Ingredient, grams: float) -> None:
        _, before = out.get(ingredient.id, (ingredient, 0.0))
        out[ingredient.id] = (ingredient, before + grams)

    for mi in meal.ingredients:
        add(mi.ingredient, mi.grams)
    for mc in meal.components:
        for mi in mc.component.ingredients:
            add(mi.ingredient, mi.grams * share(mc))
    return list(out.values())


def flat_recipe(meal: Meal) -> dict[int, float]:
    return {ingredient.id: grams for ingredient, grams in flat_items(meal)}


async def used_in(session: AsyncSession, meal_id: int) -> list[Meal]:
    """Plates this meal is a dish of."""
    return list(
        await session.scalars(
            select(Meal)
            .join(MealComponent, MealComponent.meal_id == Meal.id)
            .where(MealComponent.component_id == meal_id)
            .order_by(Meal.name)
        )
    )


async def components_for(
    session: AsyncSession,
    user: User,
    plate: Meal,
    wanted: list[ComponentIn],
    *,
    scale: float,
) -> tuple[list[MealComponent], list[Meal]]:
    """The plate's dishes from the request (portions × `scale`: the plate's portions on a post,
    1 on an edit). New dishes become meals of ours; they're returned too (for their recipes)."""
    if not wanted:
        return [], []
    if plate.id is not None and await used_in(session, plate.id):
        raise _unprocessable(
            f"{plate.name} is a dish in other plates, so it can't hold dishes itself"
        )
    out: list[MealComponent] = []
    created: list[Meal] = []
    for c in wanted:
        if c.new is not None:
            dish = await _new_dish(session, user, plate, c.new)
            created.append(dish)
        else:
            dish = await session.get(Meal, c.meal_id)
            if dish is None or dish.household_id != user.household_id:
                raise _unprocessable("That dish isn't one of our meals")
            if dish.id == plate.id:
                raise _unprocessable("A meal can't be a dish of itself")
            if dish.components:
                raise _unprocessable(f"{dish.name} holds dishes itself, so it can't be one")
        add_aliases(dish, c.aliases)
        out.append(MealComponent(component=dish, portions=c.portions * scale))
    return out, created


def add_aliases(dish: Meal, names: list[str]) -> None:
    """We swapped these for the dish: offer it for them from now on (again, if we said No)."""
    own = {a.name: a for a in dish.aliases}
    for name in {normalize(n) for n in names} - {"", normalize(dish.name)}:
        if name in own:
            own[name].declined = 0
        else:
            dish.aliases.append(MealAlias(name=name))


def set_aliases(dish: Meal, names: list[str]) -> None:
    """Edit meal: exactly these (a kept one keeps its count of "No"s)."""
    wanted = {normalize(n) for n in names} - {""}
    for alias in list(dish.aliases):
        if alias.name not in wanted:
            dish.aliases.remove(alias)
    known = {a.name for a in dish.aliases}
    dish.aliases.extend(MealAlias(name=n) for n in sorted(wanted - known))


async def _new_dish(session: AsyncSession, user: User, plate: Meal, new: NewComponent) -> Meal:
    ids = [i.ingredient_id for i in new.items]
    found = {
        i.id: i for i in await session.scalars(select(Ingredient).where(Ingredient.id.in_(ids)))
    }
    if missing := set(ids) - set(found):
        raise _unprocessable(f"Unknown ingredients {missing}")
    by_weight = sorted(new.items, key=lambda i: -i.grams)
    snack = "snack" in plate.types
    dish = Meal(
        household_id=user.household_id,
        created_by=user.id,
        name=new.name.strip(),
        emoji=new.emoji or found[by_weight[0].ingredient_id].emoji or "🍽️",
        types=list(plate.types),
        snack_kind=(plate.snack_kind or "savory") if snack else None,
        tags=[],
        prep_minutes=plate.prep_minutes or 20,
        portions=new.portions,
        steps=template_steps(
            [found[i.ingredient_id].name for i in by_weight], plate.prep_minutes, new.portions
        ),
        ingredients=[
            MealIngredient(
                ingredient_id=i.ingredient_id,
                grams=i.grams * new.portions,
                ingredient=found[i.ingredient_id],
            )
            for i in new.items
        ],
        components=[],  # a dish holds no dishes (and isn't loaded lazily later)
        aliases=[],
    )
    session.add(dish)
    await session.flush()
    return dish


async def dissolve(session: AsyncSession, dish: Meal) -> list[Meal]:
    """Before a dish is deleted: plates that hold it get its ingredients instead (same food,
    no dish). Returns those plates."""
    plates = await used_in(session, dish.id)
    for plate in plates:
        mc = next(c for c in plate.components if c.component_id == dish.id)
        own = {mi.ingredient_id: mi for mi in plate.ingredients}
        for mi in dish.ingredients:
            grams = mi.grams * share(mc)
            if mi.ingredient_id in own:
                own[mi.ingredient_id].grams += grams
            else:
                plate.ingredients.append(
                    MealIngredient(
                        ingredient_id=mi.ingredient_id, grams=grams, ingredient=mi.ingredient
                    )
                )
        plate.components.remove(mc)
    await session.flush()
    return plates
