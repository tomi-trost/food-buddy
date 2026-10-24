from fastapi import APIRouter, HTTPException, Response, status
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.auth.deps import CurrentUser, Session
from app.config import get_settings
from app.meals.schemas import CookIn, MealCard, MealCreate, MealOut, MealPatch, RatingIn
from app.meals.service import (
    cook_again,
    delete_meal,
    delete_rating,
    get_own_meal,
    meal_cards,
    meal_out,
    post_meal,
    save_rating,
    update_meal,
)
from app.meals.tasks import generate_recipe
from app.meals.undo import undo_post
from app.push.notify import RATE_AFTER_MIN
from app.push.tasks import notify_partner_rated, notify_suggested, remind_rate
from app.suggestions.service import suggest

router = APIRouter(prefix="/meals", tags=["meals"])


@router.get("")
async def list_meals(user: CurrentUser, session: Session) -> list[MealCard]:
    return await meal_cards(session, user)


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_meal(body: MealCreate, user: CurrentUser, session: Session) -> MealOut:
    meal = await post_meal(session, user, body)
    if body.origin != "home":  # bought / eaten out: no recipe, nothing to rate
        await suggest_to_others(session, user, meal, body.meal_type, body.eaten_on)
        return await meal_out(session, user, meal)
    await generate_recipe.defer_async(meal_id=meal.id)
    if body.eaten:
        await remind_rate.configure(schedule_in={"minutes": RATE_AFTER_MIN}).defer_async(
            meal_id=meal.id
        )
        await suggest_to_others(session, user, meal, body.meal_type, body.eaten_on)
    return await meal_out(session, user, meal)


async def suggest_to_others(session, user, meal, meal_type, eaten_on) -> None:
    """ "You too?" for the rest of the household, with a push."""
    for suggestion_id in await suggest(session, user, meal, meal_type, eaten_on):
        await notify_suggested.defer_async(suggestion_id=suggestion_id)


@router.get("/{meal_id}")
async def get_meal(meal_id: int, user: CurrentUser, session: Session) -> MealOut:
    return await meal_out(session, user, await get_own_meal(session, user, meal_id))


@router.patch("/{meal_id}")
async def patch_meal(meal_id: int, body: MealPatch, user: CurrentUser, session: Session) -> MealOut:
    meal = await get_own_meal(session, user, meal_id)
    await update_meal(session, meal, body)
    return await meal_out(session, user, meal)


@router.delete("/{meal_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_meal(
    meal_id: int, user: CurrentUser, session: Session, keep_log: bool = False
) -> Response:
    """Either of us can delete a household meal. Without keep_log it also leaves the food log."""
    await delete_meal(session, await get_own_meal(session, user, meal_id), keep_log=keep_log)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/{meal_id}/rating")
async def unrate_meal(meal_id: int, user: CurrentUser, session: Session) -> MealOut:
    meal = await get_own_meal(session, user, meal_id)
    await delete_rating(session, user, meal)
    return await meal_out(session, user, meal)


@router.put("/{meal_id}/rating")
async def rate_meal(meal_id: int, body: RatingIn, user: CurrentUser, session: Session) -> MealOut:
    meal = await get_own_meal(session, user, meal_id)
    await save_rating(session, user, meal, body)
    await notify_partner_rated.defer_async(meal_id=meal.id, rater_id=user.id)
    return await meal_out(session, user, meal)


@router.post("/{meal_id}/cook")
async def cook_meal(meal_id: int, body: CookIn, user: CurrentUser, session: Session) -> MealOut:
    meal = await get_own_meal(session, user, meal_id)
    await cook_again(session, user, meal, body)
    if body.eaten and body.eaten_on is not None:
        await suggest_to_others(session, user, meal, body.meal_type, body.eaten_on)
    return await meal_out(session, user, meal)


@router.get("/{meal_id}/photo", response_class=FileResponse)
async def get_meal_photo(meal_id: int, user: CurrentUser, session: Session) -> FileResponse:
    meal = await get_own_meal(session, user, meal_id)
    if not meal.photo_path:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "This meal has no photo")
    return FileResponse(get_settings().photo_dir / meal.photo_path, media_type="image/jpeg")


class Undone(BaseModel):
    analysis_id: int | None  # the photo to check again; None = typed in without a photo


@router.post("/{meal_id}/undo")
async def undo_meal(meal_id: int, user: CurrentUser, session: Session) -> Undone:
    """Take back a post right after it (see meals.undo)."""
    meal = await get_own_meal(session, user, meal_id)
    return Undone(analysis_id=await undo_post(session, user, meal))
