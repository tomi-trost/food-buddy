from datetime import date, timedelta

from fastapi import HTTPException, status
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User
from app.inventory.models import InventoryItem, RanOut
from app.meals.models import Meal
from app.nutrition.models import Ingredient
from app.nutrition.schemas import IngredientOut
from app.plan.generator import batches, round_up_to
from app.plan.models import ShoppingCheck
from app.plan.service import current_plan

RAN_OUT_GRAMS = 250  # the mock's default buy amount for an item that ran out


class ShoppingItem(BaseModel):
    ingredient: IngredientOut
    need: float
    have: float
    buy: int
    ran_out: bool
    checked: bool


class ShoppingOut(BaseModel):
    plan_approved: bool
    items: list[ShoppingItem]
    in_stock: list[IngredientOut]  # needed by the menu but already at home
    total: float


async def stock_items(session: AsyncSession, household_id: int) -> dict[int, InventoryItem]:
    rows = await session.scalars(
        select(InventoryItem).where(InventoryItem.household_id == household_id)
    )
    return {i.ingredient_id: i for i in rows}


def _order(item: ShoppingItem) -> tuple:
    """Ran-out items first, then grouped by category (the screen shows one card per category)."""
    return (not item.ran_out, item.ingredient.category, item.ingredient.name)


async def shopping_list(session: AsyncSession, user: User) -> ShoppingOut:
    hid = user.household_id
    plan = await current_plan(session, hid)
    approved = plan is not None and plan.status == "approved"

    need: dict[int, float] = {}
    ingredients: dict[int, Ingredient] = {}
    if approved:
        ids = [s.meal_id for s in plan.slots if s.meal_id]
        meals = {m.id: m for m in await session.scalars(select(Meal).where(Meal.id.in_(set(ids))))}
        times = batches([i for i in ids if i in meals], {i: m.portions for i, m in meals.items()})
        for mid, n in times.items():
            for mi in meals[mid].ingredients:
                need[mi.ingredient_id] = need.get(mi.ingredient_id, 0) + mi.grams * n
                ingredients[mi.ingredient_id] = mi.ingredient

    stock = {iid: item.grams for iid, item in (await stock_items(session, hid)).items()}
    checked = set(
        await session.scalars(
            select(ShoppingCheck.ingredient_id).where(ShoppingCheck.household_id == hid)
        )
    )
    ran_out = {
        r.ingredient_id: r.ingredient
        for r in await session.scalars(select(RanOut).where(RanOut.household_id == hid))
    }

    items: dict[int, ShoppingItem] = {}
    in_stock: list[IngredientOut] = []
    for iid, grams in need.items():
        have = stock.get(iid, 0)
        buy = round_up_to(grams - have)
        if buy == 0 and iid not in ran_out:
            in_stock.append(IngredientOut.of(ingredients[iid]))
            continue
        items[iid] = ShoppingItem(
            ingredient=IngredientOut.of(ingredients[iid]),
            need=round(grams),
            have=round(have),
            buy=buy or RAN_OUT_GRAMS,
            ran_out=iid in ran_out,
            checked=iid in checked,
        )
    for iid, ing in ran_out.items():
        if iid not in items:
            items[iid] = ShoppingItem(
                ingredient=IngredientOut.of(ing),
                need=0,
                have=0,
                buy=RAN_OUT_GRAMS,
                ran_out=True,
                checked=iid in checked,
            )

    ordered = sorted(items.values(), key=_order)
    total = sum(i.ingredient.price_per_100g * i.buy / 100 for i in ordered)
    return ShoppingOut(
        plan_approved=approved,
        items=ordered,
        in_stock=sorted(in_stock, key=lambda i: i.name),
        total=round(total, 2),
    )


async def set_checked(session: AsyncSession, user: User, ingredient_id: int, on: bool) -> None:
    existing = await session.scalar(
        select(ShoppingCheck).where(
            ShoppingCheck.household_id == user.household_id,
            ShoppingCheck.ingredient_id == ingredient_id,
        )
    )
    if on and existing is None:
        session.add(ShoppingCheck(household_id=user.household_id, ingredient_id=ingredient_id))
    elif not on and existing is not None:
        await session.delete(existing)
    await session.commit()


async def finish_shopping(session: AsyncSession, user: User, today: date) -> int:
    """Checked items go into the fridge/pantry; returns how many were added."""
    listing = await shopping_list(session, user)
    bought = [i for i in listing.items if i.checked]
    if not bought:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Tick what you bought first")
    hid = user.household_id
    stock = await stock_items(session, hid)
    shelf = dict(
        (
            await session.execute(
                select(Ingredient.id, Ingredient.shelf_days).where(
                    Ingredient.id.in_([b.ingredient.id for b in bought])
                )
            )
        ).all()
    )
    for b in bought:
        iid = b.ingredient.id
        fresh = today + timedelta(days=shelf[iid])
        item = stock.get(iid)
        if item is None:
            session.add(
                InventoryItem(household_id=hid, ingredient_id=iid, grams=b.buy, expires_on=fresh)
            )
        else:
            item.grams += b.buy
            item.expires_on = max(item.expires_on, fresh)
    ids = [b.ingredient.id for b in bought]
    await session.execute(
        delete(RanOut).where(RanOut.household_id == hid, RanOut.ingredient_id.in_(ids))
    )
    await session.execute(delete(ShoppingCheck).where(ShoppingCheck.household_id == hid))
    await session.commit()
    return len(bought)
