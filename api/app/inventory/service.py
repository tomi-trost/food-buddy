from collections.abc import Iterable, Mapping

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.inventory.models import InventoryItem, RanOut


async def deduct(session: AsyncSession, household_id: int, grams: Mapping[int, float]) -> None:
    """Take cooked amounts out of stock; items that reach 0 g are removed."""
    if not grams:
        return
    items = await session.scalars(
        select(InventoryItem).where(
            InventoryItem.household_id == household_id,
            InventoryItem.ingredient_id.in_(grams),
        )
    )
    for item in items:
        item.grams = max(0.0, item.grams - grams[item.ingredient_id])
        if item.grams <= 0:
            await session.delete(item)


async def mark_used_up(session: AsyncSession, household_id: int, ids: Iterable[int]) -> None:
    """Remove from stock and put on the shopping list ("ran out while cooking")."""
    ids = list(set(ids))
    if not ids:
        return
    await session.execute(
        delete(InventoryItem).where(
            InventoryItem.household_id == household_id, InventoryItem.ingredient_id.in_(ids)
        )
    )
    await session.execute(
        insert(RanOut)
        .values([{"household_id": household_id, "ingredient_id": i} for i in ids])
        .on_conflict_do_nothing(index_elements=["household_id", "ingredient_id"])
    )
