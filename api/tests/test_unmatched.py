from sqlalchemy import select

from app.nutrition.models import UnmatchedIngredient
from app.nutrition.seed import seed_mock
from app.nutrition.unmatched import most_seen, record_unmatched
from tests.fakes import vision_transport
from tests.test_analysis import process, upload


async def rows(session) -> dict[str, UnmatchedIngredient]:
    return {r.name: r for r in await session.scalars(select(UnmatchedIngredient))}


async def test_analysis_records_only_the_names_nothing_matched(client, auth, session):
    await seed_mock(session)
    for _ in range(2):
        job_id = (await upload(client, auth)).json()["id"]
        assert (await process(session, job_id, vision_transport())).status == "done"

    seen = await rows(session)
    assert list(seen) == ["mystery sauce"]  # chicken, rice and oil matched
    assert seen["mystery sauce"].seen == 2
    assert seen["mystery sauce"].last_dish == "Chicken rice bowl"
    assert seen["mystery sauce"].last_seen_at >= seen["mystery sauce"].first_seen_at


async def test_names_are_normalized_and_counted_once_per_analysis(session):
    await record_unmatched(session, ["Burrata ", "burrata", "  ", "Nduja"], "Pizza")
    await session.commit()
    seen = await rows(session)
    assert {n: r.seen for n, r in seen.items()} == {"burrata": 1, "nduja": 1}


async def test_nothing_recorded_when_everything_matched(session):
    await record_unmatched(session, [], "Salad")
    await session.commit()
    assert await rows(session) == {}


async def test_most_seen_first(session):
    await record_unmatched(session, ["nduja", "burrata"], "Pizza")
    await record_unmatched(session, ["burrata"], "Salad")
    await session.commit()
    assert [(r.name, r.seen) for r in await most_seen(session)] == [("burrata", 2), ("nduja", 1)]
