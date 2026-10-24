from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User
from app.auth.security import decode_access_token
from app.db import get_session
from app.nutrition.models import HouseholdUnit
from app.nutrition.units import HOUSE_UNITS

_bearer = HTTPBearer(auto_error=False)

Session = Annotated[AsyncSession, Depends(get_session)]


async def get_current_user(
    session: Session,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> User:
    user_id = decode_access_token(credentials.credentials) if credentials else None
    user = await session.get(User, user_id) if user_id is not None else None
    if user is None:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    HOUSE_UNITS.set(await house_units(session, user.household_id))
    return user


async def house_units(session: AsyncSession, household_id: int) -> dict[int, tuple[str, float]]:
    rows = await session.execute(
        select(HouseholdUnit.ingredient_id, HouseholdUnit.unit, HouseholdUnit.unit_grams).where(
            HouseholdUnit.household_id == household_id
        )
    )
    return {i: (u, g) for i, u, g in rows}


CurrentUser = Annotated[User, Depends(get_current_user)]
