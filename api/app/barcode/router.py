from typing import Annotated

from fastapi import APIRouter, HTTPException, Path, status
from pydantic import BaseModel

from app.auth.deps import CurrentUser, Session
from app.barcode import service
from app.barcode.models import OffProduct
from app.nutrition.schemas import NutrientsOut
from app.snacks.schemas import SnackKind

router = APIRouter(prefix="/barcode", tags=["barcode"])

# EAN-8, UPC-A (12), EAN-13, GTIN-14
Barcode = Annotated[str, Path(pattern=r"^\d{8,14}$")]


class ProductOut(BaseModel):
    code: str
    name: str
    brand: str
    quantity: str  # pack size as printed, e.g. "400 g"
    serving_g: float | None
    image_url: str | None
    per100: NutrientsOut | None  # None: OFF has no energy value, the user types the label
    kind: SnackKind  # guessed from OFF's categories and the sugar
    remembered: bool = False  # our values from the last time we logged it
    source: str = "Open Food Facts"


@router.get("/{code}")
async def product_by_barcode(code: Barcode, session: Session, user: CurrentUser) -> ProductOut:
    ours = await service.remembered(session, user.household_id, code)
    if ours is not None:  # no need to ask OFF; pack size and photo from its cache if we have it
        cached = await session.get(OffProduct, code)
        off = (cached.product if cached else None) or {}
        return ProductOut(
            code=code,
            name=ours.name,
            brand="",  # already in our name
            quantity=off.get("quantity", ""),
            serving_g=ours.amount,
            image_url=off.get("image_url"),
            per100=ours.per100,
            kind=ours.kind,
            remembered=True,
            source="Our values",
        )
    try:
        async with service.off_client() as client:
            product = await service.lookup(session, client, code)
    except service.OffUnavailable:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, "Open Food Facts can't be reached right now"
        ) from None
    if product is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found in Open Food Facts")
    # answers cached before `kind` existed get it guessed from the sugar alone
    return ProductOut(code=code, **{"kind": service.snack_kind([], product["per100"]), **product})
