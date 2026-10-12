from datetime import date

from fastapi import APIRouter, Response, status
from pydantic import BaseModel, Field, field_validator

from app.auth.deps import CurrentUser, Session
from app.meals.schemas import MealType, _half_steps
from app.meals.service import per_portion
from app.suggestions import service

router = APIRouter(prefix="/suggestions", tags=["suggestions"])


class SuggestedBy(BaseModel):
    id: int
    name: str
    color: str


class SuggestedMeal(BaseModel):
    id: int
    name: str
    emoji: str
    photo_url: str | None
    kcal_per_portion: float


class SuggestionOut(BaseModel):
    id: int
    by: SuggestedBy
    meal: SuggestedMeal
    meal_type: MealType
    eaten_on: date


class AcceptIn(BaseModel):
    servings_eaten: float = Field(default=1, gt=0, le=10)

    _servings = field_validator("servings_eaten")(_half_steps)


@router.get("")
async def list_suggestions(today: date, user: CurrentUser, session: Session) -> list[SuggestionOut]:
    """Meals the others logged today or yesterday that I haven't answered (or logged) yet."""
    return [
        SuggestionOut(
            id=s.id,
            by=SuggestedBy(id=by.id, name=by.name, color=by.color),
            meal=SuggestedMeal(
                id=meal.id,
                name=meal.name,
                emoji=meal.emoji,
                photo_url=f"/api/meals/{meal.id}/photo" if meal.photo_path else None,
                kcal_per_portion=round(per_portion(meal).kcal, 1),
            ),
            meal_type=s.meal_type,
            eaten_on=s.eaten_on,
        )
        for s, meal, by in await service.pending_for(session, user, today)
    ]


@router.post("/{suggestion_id}/accept")
async def accept(
    suggestion_id: int, body: AcceptIn, user: CurrentUser, session: Session
) -> dict[str, int]:
    suggestion = await service.lock_pending(session, user, suggestion_id)
    entry = await service.accept(session, user, suggestion, body.servings_eaten)
    return {"log_id": entry.id}


@router.post("/{suggestion_id}/decline", status_code=status.HTTP_204_NO_CONTENT)
async def decline(suggestion_id: int, user: CurrentUser, session: Session) -> Response:
    suggestion = await service.lock_pending(session, user, suggestion_id)
    suggestion.status = "declined"
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
