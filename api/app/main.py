from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI
from fastapi.responses import RedirectResponse
from sqlalchemy import text

from app.analysis.router import router as analysis_router
from app.auth.deps import Session
from app.auth.router import router as auth_router
from app.barcode.router import router as barcode_router
from app.inventory.router import router as inventory_router
from app.jobs import jobs_app
from app.logs.router import router as logs_router
from app.meals.router import router as meals_router
from app.nutrition.router import router as nutrition_router
from app.plan.router import router as plan_router
from app.push.router import router as push_router
from app.shopping.router import router as shopping_router
from app.snacks.router import router as snacks_router
from app.suggestions.router import router as suggestions_router


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


@api.get("/reauth", tags=["meta"], include_in_schema=False)
async def reauth(next: str = "/") -> RedirectResponse:
    """Full-page stop for the web app when Cloudflare Access' session ran out.

    The service worker serves the app shell from cache, so a plain reload never passes Access
    and every fetch gets redirected to its PIN page (fetch can't follow that). Navigating here
    goes to the network (the worker skips /api/), Access asks for the PIN, then we send the
    page back. Only same-app paths, so this can't bounce anyone to another site.
    """
    safe = next.startswith("/") and not next.startswith(("//", "/\\"))
    return RedirectResponse(next if safe else "/", 303, headers={"Cache-Control": "no-store"})


api.include_router(auth_router)
api.include_router(analysis_router)
api.include_router(meals_router)
api.include_router(push_router)
api.include_router(nutrition_router)
api.include_router(barcode_router)
api.include_router(inventory_router)
api.include_router(plan_router)
api.include_router(shopping_router)
api.include_router(logs_router)
api.include_router(snacks_router)
api.include_router(suggestions_router)
app.include_router(api)
