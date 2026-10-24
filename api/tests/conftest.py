import io
import os
import tempfile
from pathlib import Path

# Configure before anything imports app.config (settings are cached).
TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL", "postgresql+psycopg://food:food@localhost:5433/food_test"
)
os.environ["DATABASE_URL"] = TEST_DATABASE_URL
os.environ["PHOTO_DIR"] = tempfile.mkdtemp(prefix="food-buddy-photos-")
os.environ["JWT_SECRET"] = "test-secret-that-is-at-least-32-characters"
os.environ["VISION_PROVIDERS"] = '[{"name":"test","url":"http://vision.test/v1","model":"m"}]'

import httpx  # noqa: E402
import psycopg  # noqa: E402
import pytest  # noqa: E402
from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from PIL import Image  # noqa: E402
from procrastinate.testing import InMemoryConnector  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.barcode import service as barcode_service  # noqa: E402
from app.db import SessionLocal, engine  # noqa: E402
from app.jobs import jobs_app  # noqa: E402
from app.main import app  # noqa: E402

API_DIR = Path(__file__).resolve().parent.parent


def _recreate_database() -> None:
    url = TEST_DATABASE_URL.replace("postgresql+psycopg://", "postgresql://", 1)
    admin_url, db_name = url.rsplit("/", 1)
    with psycopg.connect(f"{admin_url}/postgres", autocommit=True) as conn:
        conn.execute(f'DROP DATABASE IF EXISTS "{db_name}" WITH (FORCE)')
        conn.execute(f'CREATE DATABASE "{db_name}"')


@pytest.fixture(scope="session", autouse=True)
async def database():
    _recreate_database()
    config = Config(str(API_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(API_DIR / "alembic"))
    config.attributes["database_url"] = TEST_DATABASE_URL
    command.upgrade(config, "head")
    yield
    await engine.dispose()


@pytest.fixture(autouse=True)
async def clean_tables():
    yield
    async with engine.begin() as conn:
        await conn.execute(
            text(
                "TRUNCATE analysis_job, app_user, household, ingredient, meal, food_log, "
                "inventory_item, ran_out, rating, plan_week, shopping_check, unmatched_ingredient, "
                "off_product "
                "RESTART IDENTITY CASCADE"
            )
        )


@pytest.fixture
async def session():
    async with SessionLocal() as s:
        yield s


@pytest.fixture
async def seeded(session):
    from app.nutrition.seed import seed_mock

    await seed_mock(session)
    return session


async def ingredient_ids(session, *names: str) -> list[int]:
    from sqlalchemy import select

    from app.nutrition.models import Ingredient

    rows = dict((await session.execute(select(Ingredient.name, Ingredient.id))).all())
    return [rows[n] for n in names]


@pytest.fixture
def queue():
    connector = InMemoryConnector()
    with jobs_app.replace_connector(connector):
        yield connector


@pytest.fixture
async def client(queue):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


async def register(client, email="tomi@example.com", name="Tomi", **extra) -> dict[str, str]:
    body = {"email": email, "password": "correct horse", "name": name}
    body.update(extra or {"household_name": "Home"})
    response = await client.post("/api/auth/register", json=body)
    assert response.status_code == 201, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


@pytest.fixture
async def auth(client) -> dict[str, str]:
    return await register(client)


def jpeg_bytes(size=(64, 48), color=(200, 120, 60)) -> bytes:
    out = io.BytesIO()
    Image.new("RGB", size, color).save(out, format="JPEG")
    return out.getvalue()


# Open Food Facts, faked (tests never call the network)
CODE = "8000500310427"  # a 400 g jar of hazelnut spread
OFF_PRODUCT = {
    "product_name": "Nutella",
    "brands": "Ferrero, Nutella",
    "quantity": "400 g",
    "serving_quantity": "15",
    "image_front_small_url": "https://images.openfoodfacts.org/nutella.jpg",
    "nutriments": {
        "energy-kcal_100g": 539,
        "proteins_100g": 6.3,
        "carbohydrates_100g": 57.5,
        "fat_100g": 30.9,
        "sugars_100g": 56.3,
        # no fibre on the label
    },
}


def off_transport(seen: list, product: dict | None = OFF_PRODUCT, status: int = 200):
    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        if status != 200:
            return httpx.Response(status, text="down")
        if product is None:
            return httpx.Response(404, json={"status": 0, "status_verbose": "product not found"})
        return httpx.Response(200, json={"status": 1, "code": CODE, "product": product})

    return httpx.MockTransport(handler)


@pytest.fixture
def off(monkeypatch):
    """Point the lookup at a fake OFF; returns the requests it got. `off.set(...)` changes it."""
    seen: list[httpx.Request] = []

    class Fake(list):
        def set(self, **kwargs):
            transport = off_transport(self, **kwargs)
            monkeypatch.setattr(
                barcode_service,
                "off_client",
                lambda: httpx.AsyncClient(
                    base_url="https://off.test",
                    transport=transport,
                    headers={"User-Agent": "FoodBuddy/test"},
                ),
            )

    fake = Fake(seen)
    fake.set()
    return fake
