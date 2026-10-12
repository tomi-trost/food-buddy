"""Web Push: subscriptions, preferences, sending (encrypted + signed) and the four triggers."""

from datetime import UTC, date, datetime, timedelta

import httpx
import pytest
from sqlalchemy import select

from app.analysis.models import AnalysisJob
from app.config import get_settings
from app.meals.models import CookLog
from app.push import notify
from app.push.models import PushSubscription
from app.push.service import PushMessage, push
from tests.conftest import register
from tests.fakes import FakePhone, push_transport, vapid_private_key
from tests.test_analysis_queue import RATING, finish, partner_of, snap
from tests.test_meals import body

TODAY = date(2026, 10, 4)  # same day the meal fixtures are eaten on
MESSAGE = PushMessage(title="x", body="", url="/", tag="t")


def partner_rated(meal_id, rater_id):
    return lambda s, http: notify.notify_partner_rated(s, http, meal_id, rater_id)


@pytest.fixture
def push_on(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "vapid_private_key", vapid_private_key())
    monkeypatch.setattr(settings, "vapid_subject", "mailto:test@example.com")


async def subscribe(client, headers, phone: FakePhone):
    response = await client.put("/api/push/subscription", json=phone.subscription, headers=headers)
    assert response.status_code == 204, response.text


async def user_id(client, headers) -> int:
    return (await client.get("/api/auth/me", headers=headers)).json()["id"]


async def deliver(session, call):
    """Run a notify function against a fake push service; returns the requests it made."""
    seen: list[httpx.Request] = []
    async with httpx.AsyncClient(transport=push_transport(seen)) as http:
        await call(session, http)
    return seen


# --- settings & subscriptions ---------------------------------------------------------


async def test_config_says_disabled_without_server_key(client, auth):
    config = (await client.get("/api/push", headers=auth)).json()
    assert config == {"enabled": False, "public_key": None, "off": []}
    test = await client.post("/api/push/test", headers=auth)
    assert test.status_code == 409


async def test_config_gives_public_key_when_enabled(client, auth, push_on):
    config = (await client.get("/api/push", headers=auth)).json()
    assert config["enabled"] is True
    assert len(config["public_key"]) == 87  # 65-byte P-256 point, base64url without padding
    assert (await client.get("/api/push")).status_code == 401


async def test_subscribe_is_idempotent_and_moves_device_to_new_user(client, auth, session):
    phone = FakePhone()
    await subscribe(client, auth, phone)
    await subscribe(client, auth, phone)
    partner = await partner_of(client, auth)
    await subscribe(client, partner, phone)  # same phone, now logged in as Ana

    subs = list(await session.scalars(select(PushSubscription)))
    assert len(subs) == 1
    assert subs[0].user_id == await user_id(client, partner)


async def test_subscribe_validates_endpoint_and_keys(client, auth):
    phone = FakePhone()
    insecure = phone.subscription | {"endpoint": "http://evil.example/push"}
    assert (
        await client.put("/api/push/subscription", json=insecure, headers=auth)
    ).status_code == 422
    no_keys = {"endpoint": phone.endpoint, "keys": {"p256dh": "", "auth": ""}}
    assert (
        await client.put("/api/push/subscription", json=no_keys, headers=auth)
    ).status_code == 422
    anonymous = await client.put("/api/push/subscription", json=phone.subscription)
    assert anonymous.status_code == 401


async def test_unsubscribe_removes_only_my_device(client, auth, session):
    partner = await partner_of(client, auth)
    mine, hers = FakePhone("https://web.push.apple.com/mine"), FakePhone()
    await subscribe(client, auth, mine)
    await subscribe(client, partner, hers)

    # Ana can't remove Tomi's phone
    other = await client.post(
        "/api/push/unsubscribe", json={"endpoint": mine.endpoint}, headers=partner
    )
    assert other.status_code == 204
    response = await client.post(
        "/api/push/unsubscribe", json={"endpoint": mine.endpoint}, headers=auth
    )
    assert response.status_code == 204
    left = [s.endpoint for s in await session.scalars(select(PushSubscription))]
    assert left == [hers.endpoint]


async def test_prefs_turn_kinds_off_and_reject_unknown_kinds(client, auth):
    response = await client.put("/api/push/prefs", json={"off": ["daily", "partner"]}, headers=auth)
    assert response.status_code == 200
    assert response.json()["off"] == ["daily", "partner"]
    bad = await client.put("/api/push/prefs", json={"off": ["spam"]}, headers=auth)
    assert bad.status_code == 422


async def test_test_notification_reaches_my_devices(client, auth, push_on, monkeypatch):
    phone = FakePhone()
    await subscribe(client, auth, phone)
    seen: list[httpx.Request] = []
    monkeypatch.setattr(
        "app.push.router.push_client", lambda: httpx.AsyncClient(transport=push_transport(seen))
    )

    response = await client.post("/api/push/test", headers=auth)
    assert response.status_code == 200
    assert response.json() == {"sent": 1}
    assert phone.read(seen[0])["title"] == "Notifications are on"


# --- sending ---------------------------------------------------------------------------


async def test_push_is_encrypted_and_signed_for_the_push_service(client, auth, session, push_on):
    phone = FakePhone()
    await subscribe(client, auth, phone)
    me = await user_id(client, auth)
    message = PushMessage(title="Hi", body="there", url="/meals/1", tag="t")

    seen = await deliver(session, lambda s, http: push(s, http, [me], "ready", message))

    request = seen[0]
    assert str(request.url) == phone.endpoint
    assert request.headers["content-encoding"] == "aes128gcm"
    assert request.headers["authorization"].startswith("vapid t=")
    assert int(request.headers["ttl"]) > 0
    assert phone.read(request) == {"title": "Hi", "body": "there", "url": "/meals/1", "tag": "t"}


async def test_push_does_nothing_when_disabled(client, auth, session):
    await subscribe(client, auth, FakePhone())
    me = await user_id(client, auth)
    message = PushMessage(title="Hi", body="", url="/", tag="t")
    seen = await deliver(session, lambda s, http: push(s, http, [me], "ready", message))
    assert seen == []


async def test_push_drops_expired_subscriptions(client, auth, session, push_on):
    await subscribe(client, auth, FakePhone())
    me = await user_id(client, auth)
    seen: list = []
    async with httpx.AsyncClient(transport=push_transport(seen, status=410)) as http:
        sent = await push(
            session, http, [me], "ready", PushMessage(title="x", body="", url="/", tag="t")
        )
    assert sent == 0
    assert list(await session.scalars(select(PushSubscription))) == []


async def test_push_survives_push_service_errors(client, auth, session, push_on):
    await subscribe(client, auth, FakePhone())
    me = await user_id(client, auth)
    seen: list = []
    async with httpx.AsyncClient(transport=push_transport(seen, status=500)) as http:
        sent = await push(
            session, http, [me], "ready", PushMessage(title="x", body="", url="/", tag="t")
        )
    assert sent == 0
    assert len(list(await session.scalars(select(PushSubscription)))) == 1  # kept: may be temporary


async def test_push_respects_prefs_and_sends_each_ref_once(client, auth, session, push_on):
    await subscribe(client, auth, FakePhone())
    me = await user_id(client, auth)
    message = PushMessage(title="x", body="", url="/", tag="t")

    first = await deliver(
        session, lambda s, http: push(s, http, [me], "rate", message, ref="meal1")
    )
    again = await deliver(
        session, lambda s, http: push(s, http, [me], "rate", message, ref="meal1")
    )
    assert len(first) == 1 and again == []

    await client.put("/api/push/prefs", json={"off": ["rate"]}, headers=auth)
    muted = await deliver(
        session, lambda s, http: push(s, http, [me], "rate", message, ref="meal2")
    )
    assert muted == []


# --- 1. analysis ready ----------------------------------------------------------------


async def test_ready_notifies_both_of_us_with_dish_and_link(client, auth, seeded, push_on):
    partner = await partner_of(client, auth)
    mine, hers = FakePhone("https://web.push.apple.com/mine"), FakePhone()
    await subscribe(client, auth, mine)
    await subscribe(client, partner, hers)
    job_id = await snap(client, auth)
    job = await seeded.get(AnalysisJob, job_id)
    job.status, job.result = "done", {"dish": "pasta with zucchini"}
    await seeded.commit()

    seen = await deliver(seeded, lambda s, http: notify.notify_ready(s, http, job_id))

    assert len(seen) == 2
    message = hers.read(next(r for r in seen if str(r.url) == hers.endpoint))
    assert message["title"] == "Pasta with zucchini is ready to check"
    assert message["url"] == f"/analysis/{job_id}"


async def test_ready_for_snack_and_failure(client, auth, seeded, push_on):
    phone = FakePhone()
    await subscribe(client, auth, phone)
    snack_id = await snap(client, auth, kind="snack")
    job = await seeded.get(AnalysisJob, snack_id)
    job.status, job.result = "done", {"name": "cookie"}
    await seeded.commit()
    failed_id = await snap(client, auth)
    await finish(seeded, failed_id, status="failed")

    seen = await deliver(seeded, lambda s, http: notify.notify_ready(s, http, snack_id))
    seen += await deliver(seeded, lambda s, http: notify.notify_ready(s, http, failed_id))

    snack, failed = (phone.read(r) for r in seen)
    assert snack["title"] == "Cookie is ready to log" and snack["url"] == f"/snack/{snack_id}"
    assert failed["title"] == "Couldn't analyze the photo"


async def test_ready_skips_unfinished_or_closed_jobs(client, auth, seeded, push_on):
    await subscribe(client, auth, FakePhone())
    running = await snap(client, auth)
    discarded = await snap(client, auth)
    await finish(seeded, discarded)
    await client.post(f"/api/analyses/{discarded}/discard", headers=auth)

    for job_id in (running, discarded, 999):
        assert (
            await deliver(seeded, lambda s, http, j=job_id: notify.notify_ready(s, http, j)) == []
        )


async def test_analysis_task_queues_ready_notification(client, auth, session, queue, monkeypatch):
    from app.analysis import tasks

    job_id = await snap(client, auth)

    async def fake_run(session, job_id, *args, **kwargs):
        job = await session.get(AnalysisJob, job_id)
        job.status = "done"
        return job

    monkeypatch.setattr(tasks, "run_analysis", fake_run)
    await tasks.analyze_photo.func(job_id=job_id)
    notify_jobs = [j for j in queue.jobs.values() if j["task_name"] == "notify_ready"]
    assert [j["args"] for j in notify_jobs] == [{"job_id": job_id}]
    assert notify_jobs[0]["queue_name"] == "push"


# --- 2. rate after eating --------------------------------------------------------------


async def test_posting_schedules_rate_reminder_after_the_meal(client, auth, seeded, queue):
    before = datetime.now(UTC)
    meal = (await client.post("/api/meals", json=await body(seeded), headers=auth)).json()
    reminder = next(j for j in queue.jobs.values() if j["task_name"] == "remind_rate")
    assert reminder["args"] == {"meal_id": meal["id"]}
    assert reminder["queue_name"] == "push"
    assert reminder["scheduled_at"] >= before + timedelta(minutes=89)


async def test_rate_reminder_goes_to_whoever_has_not_rated(client, auth, seeded, push_on):
    partner = await partner_of(client, auth)
    mine, hers = FakePhone("https://web.push.apple.com/mine"), FakePhone()
    await subscribe(client, auth, mine)
    await subscribe(client, partner, hers)
    meal = (await client.post("/api/meals", json=await body(seeded), headers=auth)).json()
    await client.put(f"/api/meals/{meal['id']}/rating", json=RATING, headers=auth)

    seen = await deliver(seeded, lambda s, http: notify.remind_rate(s, http, meal["id"]))

    assert [str(r.url) for r in seen] == [hers.endpoint]
    message = hers.read(seen[0])
    assert message["title"] == "How was the Chicken rice bowl?"
    assert message["url"] == f"/meals/{meal['id']}?rate=1"
    # only once, and nothing for a meal that's gone
    assert await deliver(seeded, lambda s, http: notify.remind_rate(s, http, meal["id"])) == []
    assert await deliver(seeded, lambda s, http: notify.remind_rate(s, http, 999)) == []


# --- 3. partner rated ------------------------------------------------------------------


async def test_rating_queues_partner_notification(client, auth, seeded, queue):
    meal = (await client.post("/api/meals", json=await body(seeded), headers=auth)).json()
    await client.put(f"/api/meals/{meal['id']}/rating", json=RATING, headers=auth)
    job = next(j for j in queue.jobs.values() if j["task_name"] == "notify_partner_rated")
    assert job["args"] == {"meal_id": meal["id"], "rater_id": await user_id(client, auth)}


async def test_partner_rated_tells_the_other_one_once(client, auth, seeded, push_on):
    partner = await partner_of(client, auth)
    mine, hers = FakePhone("https://web.push.apple.com/mine"), FakePhone()
    await subscribe(client, auth, mine)
    await subscribe(client, partner, hers)
    meal = (await client.post("/api/meals", json=await body(seeded), headers=auth)).json()
    await client.put(f"/api/meals/{meal['id']}/rating", json=RATING, headers=partner)
    ana = await user_id(client, partner)

    seen = await deliver(seeded, partner_rated(meal["id"], ana))

    assert [str(r.url) for r in seen] == [mine.endpoint]
    assert mine.read(seen[0])["title"] == "Ana rated the Chicken rice bowl 4.5 ★"
    again = await deliver(seeded, partner_rated(meal["id"], ana))
    assert again == []


async def test_partner_rated_skips_when_i_rated_already(client, auth, seeded, push_on):
    partner = await partner_of(client, auth)
    await subscribe(client, auth, FakePhone())
    meal = (await client.post("/api/meals", json=await body(seeded), headers=auth)).json()
    await client.put(f"/api/meals/{meal['id']}/rating", json=RATING, headers=auth)
    await client.put(f"/api/meals/{meal['id']}/rating", json=RATING, headers=partner)
    ana = await user_id(client, partner)
    seen = await deliver(seeded, partner_rated(meal["id"], ana))
    assert seen == []


# --- 4. daily reminder -----------------------------------------------------------------


async def test_daily_reminder_counts_meals_to_rate_and_photos_to_check(
    client, auth, seeded, push_on
):
    phone = FakePhone()
    await subscribe(client, auth, phone)
    await client.post("/api/meals", json=await body(seeded), headers=auth)
    await client.post("/api/meals", json=await body(seeded, name="Soup"), headers=auth)
    ready = await snap(client, auth)
    await finish(seeded, ready)
    await snap(client, auth)  # still analyzing: not counted

    seen = await deliver(seeded, lambda s, http: notify.daily_reminder(s, http, TODAY))
    message = phone.read(seen[0])
    assert message["body"] == "2 meals to rate · 1 photo to check"
    assert message["url"] == "/"
    # once per day
    assert await deliver(seeded, lambda s, http: notify.daily_reminder(s, http, TODAY)) == []


async def test_daily_reminder_is_quiet_when_nothing_waits(client, auth, seeded, push_on):
    await subscribe(client, auth, FakePhone())
    meal = (await client.post("/api/meals", json=await body(seeded), headers=auth)).json()
    await client.put(f"/api/meals/{meal['id']}/rating", json=RATING, headers=auth)
    assert await deliver(seeded, lambda s, http: notify.daily_reminder(s, http, TODAY)) == []


async def test_daily_reminder_ignores_old_meals(client, auth, seeded, push_on):
    phone = FakePhone()
    await subscribe(client, auth, phone)
    await client.post("/api/meals", json=await body(seeded), headers=auth)
    for log in await seeded.scalars(select(CookLog)):
        log.cooked_on = TODAY - timedelta(days=20)
    await seeded.commit()
    assert await deliver(seeded, lambda s, http: notify.daily_reminder(s, http, TODAY)) == []


async def test_daily_reminder_singular_and_other_households(client, auth, seeded, push_on):
    phone = FakePhone()
    await subscribe(client, auth, phone)
    await client.post("/api/meals", json=await body(seeded), headers=auth)
    stranger = await register(client, email="x@example.com")
    other_phone = FakePhone("https://web.push.apple.com/stranger")
    await subscribe(client, stranger, other_phone)  # nothing waiting for them

    seen = await deliver(seeded, lambda s, http: notify.daily_reminder(s, http, TODAY))
    assert [str(r.url) for r in seen] == [phone.endpoint]
    assert phone.read(seen[0])["body"] == "1 meal to rate"
