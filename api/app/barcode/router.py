from typing import Annotated

from fastapi import APIRouter, HTTPException, Path, status
from pydantic import BaseModel

from app.auth.deps import CurrentUser, Session
from app.barcode import service
from app.nutrition.schemas import NutrientsOut

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
    source: str = "Open Food Facts"


@router.get("/{code}")
async def product_by_barcode(code: Barcode, session: Session, _: CurrentUser) -> ProductOut:
    try:
        async with service.off_client() as client:
            product = await service.lookup(session, client, code)
    except service.OffUnavailable:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, "Open Food Facts can't be reached right now"
        ) from None
    if product is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found in Open Food Facts")
    return ProductOut(code=code, **product)
