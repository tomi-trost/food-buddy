from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User


async def household_members(session: AsyncSession, household_id: int) -> list[User]:
    return list(
        await session.scalars(
            select(User).where(User.household_id == household_id).order_by(User.id)
        )
    )
