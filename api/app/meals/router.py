from fastapi import APIRouter, HTTPException, status
from fastapi.responses import FileResponse

from app.auth.deps import CurrentUser, Session
from app.config import get_settings
from app.meals.schemas import MealCreate, MealOut
from app.meals.service import get_own_meal, meal_out, post_meal
from app.meals.tasks import generate_recipe

router = APIRouter(prefix="/meals", tags=["meals"])


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_meal(body: MealCreate, user: CurrentUser, session: Session) -> MealOut:
    meal = await post_meal(session, user, body)
    await generate_recipe.defer_async(meal_id=meal.id)
    return meal_out(meal)


@router.get("/{meal_id}")
async def get_meal(meal_id: int, user: CurrentUser, session: Session) -> MealOut:
    return meal_out(await get_own_meal(session, user, meal_id))


@router.get("/{meal_id}/photo", response_class=FileResponse)
async def get_meal_photo(meal_id: int, user: CurrentUser, session: Session) -> FileResponse:
    meal = await get_own_meal(session, user, meal_id)
    if not meal.photo_path:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "This meal has no photo")
    return FileResponse(get_settings().photo_dir / meal.photo_path, media_type="image/jpeg")
