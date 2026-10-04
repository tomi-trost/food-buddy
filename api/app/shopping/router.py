from datetime import date

from fastapi import APIRouter
from pydantic import BaseModel

from app.auth.deps import CurrentUser, Session
from app.shopping.service import ShoppingOut, finish_shopping, set_checked, shopping_list

router = APIRouter(prefix="/shopping", tags=["shopping"])


class CheckIn(BaseModel):
    checked: bool


class FinishIn(BaseModel):
    today: date


@router.get("")
async def get_shopping(user: CurrentUser, session: Session) -> ShoppingOut:
    return await shopping_list(session, user)


@router.put("/check/{ingredient_id}")
async def check_item(
    ingredient_id: int, body: CheckIn, user: CurrentUser, session: Session
) -> ShoppingOut:
    await set_checked(session, user, ingredient_id, body.checked)
    return await shopping_list(session, user)


@router.post("/finish")
async def finish(body: FinishIn, user: CurrentUser, session: Session) -> dict[str, int]:
    return {"added": await finish_shopping(session, user, body.today)}
