"""Web Push (RFC 8030/8291/8292): encrypt a small JSON message per device and hand it to the
browser's push service (Apple, Google, Mozilla). Free; no third-party account needed.
"""

import base64
import json
import logging
import os
import time
from collections.abc import Iterable
from typing import Literal
from urllib.parse import urlsplit

import http_ece
import httpx
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from py_vapid import Vapid
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User
from app.config import Settings, get_settings
from app.push.models import PushSent, PushSubscription

log = logging.getLogger(__name__)

Kind = Literal["ready", "rate", "partner", "daily"]
KINDS: tuple[Kind, ...] = ("ready", "rate", "partner", "daily")

TTL_S = 12 * 3600  # phone offline longer than this: the notification is stale anyway


class PushMessage(BaseModel):
    """What the service worker shows; `tag` replaces an older notification with the same tag."""

    title: str
    body: str
    url: str
    tag: str


def _b64decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def _b64encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def vapid(settings: Settings | None = None) -> Vapid | None:
    settings = settings or get_settings()
    if not settings.vapid_private_key or not settings.vapid_subject:
        return None
    return Vapid.from_raw(settings.vapid_private_key.encode())


def public_key(key: Vapid) -> str:
    """applicationServerKey for PushManager.subscribe()."""
    return _b64encode(
        key.public_key.public_bytes(
            serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
        )
    )


def valid_device_keys(p256dh: str, auth: str) -> bool:
    try:
        ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), _b64decode(p256dh))
        return len(_b64decode(auth)) == 16
    except ValueError:
        return False


def _encrypt(sub: PushSubscription, payload: bytes) -> bytes:
    return http_ece.encrypt(
        payload,
        salt=os.urandom(16),
        private_key=ec.generate_private_key(ec.SECP256R1()),  # fresh key per message
        dh=_b64decode(sub.p256dh),
        auth_secret=_b64decode(sub.auth),
        version="aes128gcm",
    )


async def _deliver(
    client: httpx.AsyncClient, key: Vapid, subject: str, sub: PushSubscription, payload: bytes
) -> int:
    origin = "{0.scheme}://{0.netloc}".format(urlsplit(sub.endpoint))
    headers = key.sign({"sub": subject, "aud": origin, "exp": int(time.time()) + 12 * 3600})
    headers |= {"Content-Encoding": "aes128gcm", "TTL": str(TTL_S), "Urgency": "normal"}
    response = await client.post(
        sub.endpoint, content=_encrypt(sub, payload), headers=headers, timeout=15
    )
    return response.status_code


async def push(
    session: AsyncSession,
    client: httpx.AsyncClient,
    user_ids: Iterable[int],
    kind: Kind,
    message: PushMessage,
    ref: str | None = None,
    ignore_mute: bool = False,  # the "send a test" button
) -> int:
    """Send to every device of these people (minus those who muted `kind`).

    With `ref`, each person gets it at most once. Returns how many devices accepted it.
    """
    settings = get_settings()
    key = vapid(settings)
    ids = set(user_ids)
    if key is None or not ids:
        return 0
    # populate_existing: prefs may have changed since this session first loaded the user
    users = list(
        await session.scalars(
            select(User).where(User.id.in_(ids)).execution_options(populate_existing=True)
        )
    )
    wanted = {u.id for u in users if ignore_mute or kind not in (u.notify_off or [])}
    if ref is not None and wanted:
        done = await session.scalars(
            select(PushSent.user_id).where(
                PushSent.user_id.in_(wanted), PushSent.kind == kind, PushSent.ref == ref
            )
        )
        wanted -= set(done)
    subs = list(
        await session.scalars(select(PushSubscription).where(PushSubscription.user_id.in_(wanted)))
    )

    payload = json.dumps(message.model_dump()).encode()
    sent = 0
    for sub in subs:
        try:
            status = await _deliver(client, key, settings.vapid_subject, sub, payload)
        except (httpx.HTTPError, ValueError) as exc:
            log.warning("push to %s failed: %r", sub.endpoint[:40], exc)
            continue
        if status in (404, 410):  # unsubscribed or expired: forget the device
            await session.delete(sub)
        elif status >= 400:
            log.warning("push service answered %s for %s", status, sub.endpoint[:40])
        else:
            sent += 1
    if ref is not None:
        for uid in {s.user_id for s in subs}:
            session.add(PushSent(user_id=uid, kind=kind, ref=ref))
    await session.commit()
    return sent


def push_client() -> httpx.AsyncClient:
    return httpx.AsyncClient()
