"""Migration 0024: effort and fill become −3…+3 sliders; snacks lose them."""

from sqlalchemy import select

from app.analysis.models import AnalysisRating
from app.db import engine
from app.ratings.models import Rating
from tests.conftest import register
from tests.test_analysis_queue import snap
from tests.test_meals import body
from tests.test_migration_0022 import alembic, sql
from tests.test_snack_meals import pudding


async def test_old_ratings_move_onto_the_sliders(client, seeded):
    auth = await register(client)
    lunch = (await client.post("/api/meals", json=await body(seeded), headers=auth)).json()
    dinner = (await client.post("/api/meals", json=await body(seeded), headers=auth)).json()
    snack = await pudding(client, auth, seeded)
    job = await snap(client, auth)
    await sql("UPDATE analysis_job SET meal_type = 'snack' WHERE id = :id", id=job)
    await engine.dispose()
    alembic("0023", down=True)
    try:
        for meal_id, effort, fill in [
            (lunch["id"], 5, "hungry"),
            (dinner["id"], 1, "heavy"),
            (snack["id"], 3, "right"),
        ]:
            await sql(
                "INSERT INTO rating (meal_id, user_id, taste, again, effort, fill) "
                "VALUES (:meal, 1, 4, 5, :effort, :fill)",
                meal=meal_id,
                effort=effort,
                fill=fill,
            )
        await sql(
            "INSERT INTO analysis_rating (job_id, user_id, taste, again, effort, fill) "
            "VALUES (:job, 1, 4, 5, 5, 'heavy')",
            job=job,
        )
        await engine.dispose()
    finally:
        alembic("head")

    async with engine.connect() as conn:
        rows = (await conn.execute(select(Rating.meal_id, Rating.effort, Rating.fill))).all()
        early = (await conn.execute(select(AnalysisRating.effort, AnalysisRating.fill))).all()
    assert {r.meal_id: (r.effort, r.fill) for r in rows} == {
        lunch["id"]: (3, -2),
        dinner["id"]: (-3, 2),
        snack["id"]: (None, None),
    }
    assert early == [(None, None)]
