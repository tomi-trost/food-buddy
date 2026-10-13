"""Household portion priors: learned from how we correct the model, fed into the meal prompt."""

import json

from app.analysis.priors import MAX_PRIORS, Prior, portion_priors, priors_hint
from tests.conftest import ingredient_ids, register
from tests.fakes import vision_transport
from tests.test_analysis import process
from tests.test_analysis_queue import partner_of, snap
from tests.test_meals import body

# The fake model always says: chicken 150 g, rice 200 g, oil 10 g (+ an unmatched sauce)


async def post_corrected(client, headers, seeded, rice=250, chicken=150, oil=5, portions=2):
    """Snap → model answer → post it with our plate grams (the server stores × portions)."""
    job = await snap(client, headers)
    await process(seeded, job, vision_transport())
    ids = await ingredient_ids(seeded, "Chicken breast", "Rice (cooked)", "Olive oil")
    grams = (chicken, rice, oil)
    items = [{"ingredient_id": i, "grams": g} for i, g in zip(ids, grams, strict=True)]
    response = await client.post(
        "/api/meals",
        json=await body(seeded, analysis_id=job, items=items, portions=portions),
        headers=headers,
    )
    assert response.status_code == 201, response.text


def prompt_text(request) -> str:
    """The user message the model got (photo: the text part)."""
    content = json.loads(request.content)["messages"][1]["content"]
    return content if isinstance(content, str) else content[0]["text"]


async def household(client, headers) -> int:
    return (await client.get("/api/auth/me", headers=headers)).json()["household"]["id"]


async def test_no_history_means_no_hint(client, auth, seeded):
    seen = []
    await process(seeded, await snap(client, auth), vision_transport(seen=seen))
    assert prompt_text(seen[0]) == "Analyze this meal."
    assert await portion_priors(seeded, await household(client, auth)) == []


async def test_learns_what_we_keep_correcting_and_tells_the_model(client, auth, seeded):
    await post_corrected(client, auth, seeded, rice=250, portions=2)
    await post_corrected(client, auth, seeded, rice=262, portions=3)  # 1 plate either way

    priors = await portion_priors(seeded, await household(client, auth))
    # chicken was right (150 = 150): not a prior; oil 10 → 5 and rice 200 → ~255 are
    assert [(p.name, p.grams, p.seen) for p in priors] == [
        ("olive oil", 5, 2),
        ("rice (cooked)", 255, 2),
    ]

    seen = []
    await process(seeded, await snap(client, auth), vision_transport(seen=seen))
    assert prompt_text(seen[0]) == (
        "Analyze this meal.\nThis household's usual portions on one plate "
        "(from their corrections): olive oil 5 g, rice (cooked) 255 g."
    )


async def test_one_correction_or_small_ones_are_not_enough(client, auth, seeded):
    await post_corrected(client, auth, seeded, rice=300, oil=10)
    assert await portion_priors(seeded, await household(client, auth)) == []  # seen once
    await post_corrected(client, auth, seeded, rice=210, oil=11)  # rice: +50%, +5% → median 27%
    priors = await portion_priors(seeded, await household(client, auth))
    assert [p.name for p in priors] == ["rice (cooked)"]  # oil +0%/+10%: close enough


async def test_both_of_us_count_but_other_households_dont(client, auth, seeded):
    partner = await partner_of(client, auth)
    await post_corrected(client, auth, seeded)
    await post_corrected(client, partner, seeded)
    assert len(await portion_priors(seeded, await household(client, auth))) == 2

    stranger = await register(client, email="x@example.com")
    assert await portion_priors(seeded, await household(client, stranger)) == []
    seen = []
    await process(seeded, await snap(client, stranger), vision_transport(seen=seen))
    assert prompt_text(seen[0]) == "Analyze this meal."


async def test_typed_meals_get_the_hint_too(client, auth, seeded):
    await post_corrected(client, auth, seeded)
    await post_corrected(client, auth, seeded)
    response = await client.post(
        "/api/analyses/text", json={"kind": "meal", "text": "Chicken rice bowl"}, headers=auth
    )
    seen = []
    await process(seeded, response.json()["id"], vision_transport(seen=seen))
    assert prompt_text(seen[0]).startswith("Chicken rice bowl\nThis household's usual portions")


def test_hint_text_is_empty_without_priors():
    assert priors_hint([]) == ""
    assert priors_hint([Prior(1, "rice (cooked)", 180, 3)]) == (
        "This household's usual portions on one plate (from their corrections): "
        "rice (cooked) 180 g."
    )


async def test_hint_is_capped(client, auth, seeded, monkeypatch):
    from app.analysis import priors as module

    monkeypatch.setattr(module, "MAX_PRIORS", 1)
    await post_corrected(client, auth, seeded)
    await post_corrected(client, auth, seeded)
    assert len(await portion_priors(seeded, await household(client, auth))) == 1
    assert MAX_PRIORS == 8
