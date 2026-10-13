"""Barcode → product with per-100 g values from Open Food Facts (ODbL), cached in `off_product`.

Known products are kept 30 days, unknown codes 1 day (someone may add them to OFF). When OFF
can't be reached, a stale cached answer is better than none.
"""

from datetime import UTC, datetime, timedelta

import httpx
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User
from app.barcode.models import HouseholdProduct, OffProduct
from app.config import get_settings

FOUND_TTL = timedelta(days=30)
NOT_FOUND_TTL = timedelta(days=1)
FIELDS = ",".join(
    ["product_name", "product_name_en", "brands", "quantity", "serving_quantity",
     "image_front_small_url", "nutriments", "categories_tags"]
)  # fmt: skip
KJ_PER_KCAL = 4.184
NUTRIMENTS = {  # ours → OFF key, per 100 g
    "protein": "proteins_100g",
    "carbs": "carbohydrates_100g",
    "fat": "fat_100g",
    "fiber": "fiber_100g",
    "sugar": "sugars_100g",
}


SWEET_CATEGORIES = {
    "en:sweet-snacks", "en:confectioneries", "en:chocolates", "en:biscuits-and-cakes",
    "en:desserts", "en:sweet-spreads", "en:candies", "en:ice-creams-and-sorbets",
}  # fmt: skip
SWEET_SUGAR = 15  # g per 100 g: sweet without a telling category (e.g. cereal bars)


class OffUnavailable(Exception):
    """Open Food Facts didn't answer and nothing is cached."""


def off_client() -> httpx.AsyncClient:
    settings = get_settings()
    return httpx.AsyncClient(
        base_url=settings.off_url, headers={"User-Agent": settings.off_user_agent}, timeout=10
    )


def _number(value) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if number >= 0 else None


def per100(nutriments: dict) -> dict[str, float] | None:
    """Our six values per 100 g, or None without an energy value. Missing macros count as 0."""
    kcal = _number(nutriments.get("energy-kcal_100g"))
    if kcal is None and (kj := _number(nutriments.get("energy_100g"))) is not None:
        kcal = kj / KJ_PER_KCAL  # OFF's `energy` is kJ
    if kcal is None:
        return None
    values = {k: _number(nutriments.get(off)) or 0.0 for k, off in NUTRIMENTS.items()}
    return {"kcal": round(kcal, 1), **{k: round(v, 2) for k, v in values.items()}}


def snack_kind(categories: list[str], per100: dict[str, float] | None) -> str:
    """Guess for the snack type toggle: sweet | savory | drink (the user can change it)."""
    tags = set(categories)
    if "en:beverages" in tags:
        return "drink"
    if tags & SWEET_CATEGORIES or (per100 is not None and per100["sugar"] >= SWEET_SUGAR):
        return "sweet"
    return "savory"


def product_of(raw: dict) -> dict:
    """The parts of an OFF product we keep."""
    values = per100(raw.get("nutriments") or {})
    return {
        "name": (raw.get("product_name") or raw.get("product_name_en") or "").strip(),
        "brand": (raw.get("brands") or "").split(",")[0].strip(),
        "quantity": (raw.get("quantity") or "").strip(),
        "serving_g": _number(raw.get("serving_quantity")),
        "image_url": raw.get("image_front_small_url") or None,
        "per100": values,
        "kind": snack_kind(raw.get("categories_tags") or [], values),
    }


async def _fetch(client: httpx.AsyncClient, code: str) -> dict | None:
    response = await client.get(f"/api/v2/product/{code}.json", params={"fields": FIELDS})
    if response.status_code == 404:
        return None
    response.raise_for_status()
    body = response.json()
    if body.get("status") != 1 or not body.get("product"):
        return None
    return product_of(body["product"])


async def lookup(
    session: AsyncSession, client: httpx.AsyncClient, code: str, now: datetime | None = None
) -> dict | None:
    """The product for a barcode, or None when Open Food Facts doesn't know it."""
    now = now or datetime.now(UTC)
    cached = await session.get(OffProduct, code)
    if cached is not None:
        ttl = FOUND_TTL if cached.product is not None else NOT_FOUND_TTL
        if now - cached.fetched_at < ttl:
            return cached.product

    try:
        product = await _fetch(client, code)
    except (httpx.HTTPError, ValueError) as exc:
        if cached is not None:
            return cached.product
        raise OffUnavailable from exc

    stmt = insert(OffProduct).values(code=code, product=product, fetched_at=now)
    stmt = stmt.on_conflict_do_update(
        index_elements=["code"], set_={"product": product, "fetched_at": now}
    )
    await session.execute(stmt)
    await session.commit()
    return product


async def remembered(
    session: AsyncSession, household_id: int, code: str
) -> HouseholdProduct | None:
    return await session.scalar(
        select(HouseholdProduct).where(
            HouseholdProduct.household_id == household_id, HouseholdProduct.code == code
        )
    )


async def remember(
    session: AsyncSession, user: User, code: str, name: str, kind: str, per100: dict, amount: float
) -> None:
    """Keep a scanned product as just logged (the caller commits)."""
    values = {"name": name, "kind": kind, "per100": per100, "amount": amount, "updated_by": user.id}
    stmt = insert(HouseholdProduct).values(household_id=user.household_id, code=code, **values)
    stmt = stmt.on_conflict_do_update(
        index_elements=["household_id", "code"], set_={**values, "updated_at": func.now()}
    )
    await session.execute(stmt)
