from datetime import date, timedelta

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.auth.deps import CurrentUser, Session
from app.inventory.models import InventoryItem
from app.inventory.service import mark_used_up
from app.meals.models import Meal
from app.meals.schemas import MealCard
from app.meals.service import meal_cards
from app.nutrition.models import Ingredient
from app.nutrition.schemas import IngredientOut

router = APIRouter(prefix="/inventory", tags=["inventory"])

DEFAULT_ADD_GRAMS = 250  # the mock's "+250 g"; sensible per-ingredient defaults are in ideas.md


class StockOut(BaseModel):
    ingredient: IngredientOut
    grams: float
    expires_on: date
    days_left: int


class AddIn(BaseModel):
    ingredient_id: int
    grams: float = Field(default=DEFAULT_ADD_GRAMS, gt=0, le=20000)
    today: date


class ChangeIn(BaseModel):
    delta: float = Field(ge=-20000, le=20000)


def stock_out(item: InventoryItem, today: date) -> StockOut:
    return StockOut(
        ingredient=IngredientOut.of(item.ingredient),
        grams=round(item.grams, 1),
        expires_on=item.expires_on,
        days_left=(item.expires_on - today).days,
    )


async def own_item(session, household_id: int, ingredient_id: int) -> InventoryItem:
    item = await session.scalar(
        select(InventoryItem).where(
            InventoryItem.household_id == household_id,
            InventoryItem.ingredient_id == ingredient_id,
        )
    )
    if item is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not in stock")
    return item


@router.get("")
async def list_stock(user: CurrentUser, session: Session, today: date) -> list[StockOut]:
    """Soonest expiry first. `today` is the phone's local date."""
    items = await session.scalars(
        select(InventoryItem)
        .where(InventoryItem.household_id == user.household_id)
        .order_by(InventoryItem.expires_on, InventoryItem.id)
    )
    return [stock_out(i, today) for i in items]


@router.post("", status_code=status.HTTP_201_CREATED)
async def add_stock(body: AddIn, user: CurrentUser, session: Session) -> StockOut:
    ingredient = await session.get(Ingredient, body.ingredient_id)
    if ingredient is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown ingredient")
    fresh_until = body.today + timedelta(days=ingredient.shelf_days)
    item = await session.scalar(
        select(InventoryItem).where(
            InventoryItem.household_id == user.household_id,
            InventoryItem.ingredient_id == ingredient.id,
        )
    )
    if item is None:
        item = InventoryItem(
            household_id=user.household_id,
            ingredient_id=ingredient.id,
            grams=0,
            expires_on=fresh_until,
            ingredient=ingredient,
        )
        session.add(item)
    item.grams += body.grams
    item.expires_on = max(item.expires_on, fresh_until)
    await session.commit()
    return stock_out(item, body.today)


@router.patch("/{ingredient_id}")
async def change_stock(
    ingredient_id: int, body: ChangeIn, user: CurrentUser, session: Session, today: date
) -> StockOut:
    item = await own_item(session, user.household_id, ingredient_id)
    if item.grams + body.delta <= 0:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "That would leave nothing: remove the item instead (used up or thrown away)",
        )
    item.grams += body.delta
    await session.commit()
    return stock_out(item, today)


@router.delete("/{ingredient_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_stock(
    ingredient_id: int, user: CurrentUser, session: Session, used_up: bool = Query(default=False)
) -> None:
    """used_up=true also puts it on the shopping list (the mock's "Yes, used it up")."""
    item = await own_item(session, user.household_id, ingredient_id)
    if used_up:
        await mark_used_up(session, user.household_id, [ingredient_id])
    else:
        await session.delete(item)
    await session.commit()


@router.get("/cookable")
async def cookable(user: CurrentUser, session: Session, limit: int = 2) -> list[MealCard]:
    """Meals whose every ingredient is at least half in stock (mock rule)."""
    stock = dict(
        (
            await session.execute(
                select(InventoryItem.ingredient_id, InventoryItem.grams).where(
                    InventoryItem.household_id == user.household_id
                )
            )
        ).all()
    )
    meals = await session.scalars(select(Meal).where(Meal.household_id == user.household_id))
    ok = {
        m.id
        for m in meals
        if m.ingredients
        and all(stock.get(mi.ingredient_id, 0) >= mi.grams * 0.5 for mi in m.ingredients)
    }
    cards = [c for c in await meal_cards(session, user) if c.id in ok]
    cards.sort(key=lambda c: -(c.score or 0))
    return cards[:limit]
