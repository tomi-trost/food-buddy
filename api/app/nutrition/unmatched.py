"""Remember ingredient names nothing matched, so we know which foods to add to the catalog.

List them on the VM (most frequent first):
  docker compose exec api python -m app.nutrition.unmatched
"""

import asyncio

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import SessionLocal
from app.nutrition.matching import normalize
from app.nutrition.models import UnmatchedIngredient


async def record_unmatched(session: AsyncSession, names: list[str], dish: str) -> None:
    """Count one sighting per name (the caller commits)."""
    for name in {normalize(n)[:200] for n in names} - {""}:
        stmt = insert(UnmatchedIngredient).values(name=name, last_dish=dish[:200])
        await session.execute(
            stmt.on_conflict_do_update(
                index_elements=["name"],
                set_={
                    "seen": UnmatchedIngredient.seen + 1,
                    "last_dish": stmt.excluded.last_dish,
                    "last_seen_at": func.now(),
                },
            )
        )


async def most_seen(session: AsyncSession, limit: int = 100) -> list[UnmatchedIngredient]:
    rows = await session.scalars(
        select(UnmatchedIngredient)
        .order_by(UnmatchedIngredient.seen.desc(), UnmatchedIngredient.last_seen_at.desc())
        .limit(limit)
    )
    return list(rows)


async def _main() -> None:
    async with SessionLocal() as session:
        rows = await most_seen(session)
    if not rows:
        print("Every ingredient so far matched something.")
    for row in rows:
        print(f"{row.seen:4}× {row.name}  (last: {row.last_dish}, {row.last_seen_at:%Y-%m-%d})")


if __name__ == "__main__":
    asyncio.run(_main())
