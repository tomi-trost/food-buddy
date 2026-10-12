from fastapi import APIRouter, HTTPException, Response, status
from fastapi.responses import FileResponse

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
from app.push.notify import RATE_AFTER_MIN
from app.push.tasks import notify_partner_rated, remind_rate

router = APIRouter(prefix="/meals", tags=["meals"])


@router.get("")
async def list_meals(user: CurrentUser, session: Session) -> list[MealCard]:
    return await meal_cards(session, user)


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_meal(body: MealCreate, user: CurrentUser, session: Session) -> MealOut:
    meal = await post_meal(session, user, body)
    await generate_recipe.defer_async(meal_id=meal.id)
    if body.eaten:
        await remind_rate.configure(schedule_in={"minutes": RATE_AFTER_MIN}).defer_async(
            meal_id=meal.id
        )
    return await meal_out(session, user, meal)


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
    return await meal_out(session, user, meal)


@router.get("/{meal_id}/photo", response_class=FileResponse)
async def get_meal_photo(meal_id: int, user: CurrentUser, session: Session) -> FileResponse:
    meal = await get_own_meal(session, user, meal_id)
    if not meal.photo_path:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "This meal has no photo")
    return FileResponse(get_settings().photo_dir / meal.photo_path, media_type="image/jpeg")
