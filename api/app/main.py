from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI
from sqlalchemy import text

from app.analysis.router import router as analysis_router
from app.auth.deps import Session
from app.auth.router import router as auth_router
from app.inventory.router import router as inventory_router
from app.jobs import jobs_app
from app.logs.router import router as logs_router
from app.meals.router import router as meals_router
from app.nutrition.router import router as nutrition_router
from app.plan.router import router as plan_router
from app.shopping.router import router as shopping_router
from app.snacks.router import router as snacks_router


@asynccontextmanager
async def lifespan(_: FastAPI):
    async with jobs_app.open_async():
        yield


app = FastAPI(
    title="Food Buddy API", lifespan=lifespan, docs_url="/api/docs", openapi_url="/api/openapi.json"
)

api = APIRouter(prefix="/api")


@api.get("/health", tags=["meta"])
async def health(session: Session) -> dict[str, str]:
    await session.execute(text("SELECT 1"))
    return {"status": "ok"}


api.include_router(auth_router)
api.include_router(analysis_router)
api.include_router(meals_router)
api.include_router(nutrition_router)
api.include_router(inventory_router)
api.include_router(plan_router)
api.include_router(shopping_router)
api.include_router(logs_router)
api.include_router(snacks_router)
app.include_router(api)
