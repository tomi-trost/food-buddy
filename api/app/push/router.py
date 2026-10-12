from fastapi import APIRouter, HTTPException, Response, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import delete, select

from app.auth.deps import CurrentUser, Session
from app.push.models import PushSubscription
from app.push.service import (
    Kind,
    PushMessage,
    public_key,
    push,
    push_client,
    valid_device_keys,
    vapid,
)

router = APIRouter(prefix="/push", tags=["push"])


class PushConfig(BaseModel):
    enabled: bool  # the server has VAPID keys
    public_key: str | None
    off: list[str]  # kinds this person muted


class DeviceKeys(BaseModel):
    p256dh: str = Field(min_length=1, max_length=120)
    auth: str = Field(min_length=1, max_length=60)


class SubscriptionIn(BaseModel):
    """PushSubscription.toJSON() from the browser."""

    endpoint: str = Field(max_length=1000)
    keys: DeviceKeys

    @field_validator("endpoint")
    @classmethod
    def https_only(cls, v: str) -> str:
        if not v.startswith("https://"):
            raise ValueError("endpoint must be https")
        return v


class Unsubscribe(BaseModel):
    endpoint: str


class Prefs(BaseModel):
    off: list[Kind]


def config(user) -> PushConfig:
    key = vapid()
    return PushConfig(
        enabled=key is not None,
        public_key=public_key(key) if key else None,
        off=list(user.notify_off or []),
    )


@router.get("")
async def get_config(user: CurrentUser) -> PushConfig:
    return config(user)


@router.put("/subscription", status_code=status.HTTP_204_NO_CONTENT)
async def subscribe(body: SubscriptionIn, user: CurrentUser, session: Session) -> Response:
    if not valid_device_keys(body.keys.p256dh, body.keys.auth):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Invalid device keys")
    sub = await session.scalar(
        select(PushSubscription).where(PushSubscription.endpoint == body.endpoint)
    )
    if sub is None:
        sub = PushSubscription(endpoint=body.endpoint)
        session.add(sub)
    # The same phone may be used by the other person after a logout/login
    sub.user_id, sub.p256dh, sub.auth = user.id, body.keys.p256dh, body.keys.auth
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/unsubscribe", status_code=status.HTTP_204_NO_CONTENT)
async def unsubscribe(body: Unsubscribe, user: CurrentUser, session: Session) -> Response:
    await session.execute(
        delete(PushSubscription).where(
            PushSubscription.endpoint == body.endpoint, PushSubscription.user_id == user.id
        )
    )
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put("/prefs")
async def set_prefs(body: Prefs, user: CurrentUser, session: Session) -> PushConfig:
    user.notify_off = sorted(set(body.off))
    await session.commit()
    return config(user)


@router.post("/test")
async def send_test(user: CurrentUser, session: Session) -> dict[str, int]:
    if vapid() is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Notifications aren't set up on the server")
    message = PushMessage(
        title="Notifications are on",
        body="This is how Food Buddy will nudge you.",
        url="/",
        tag="test",
    )
    async with push_client() as client:
        sent = await push(session, client, [user.id], "ready", message, ignore_mute=True)
    return {"sent": sent}
