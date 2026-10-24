from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException, Path, status
from pydantic import BaseModel, Field

from app.auth.deps import CurrentUser, Session
from app.barcode import service
from app.barcode.models import OffProduct
from app.nutrition.schemas import IngredientOut, NutrientsOut
from app.snacks.schemas import NutrientsIn, SnackKind

router = APIRouter(prefix="/barcode", tags=["barcode"])

# EAN-8, UPC-A (12), EAN-13, GTIN-14
Barcode = Annotated[str, Path(pattern=r"^\d{8,14}$")]


class ProductOut(BaseModel):
    code: str
    name: str
    brand: str
    quantity: str  # pack size as printed, e.g. "400 g"
    per: Literal["100g", "100ml"] = "100g"  # per100 and serving_g are per 100 ml / ml (drinks)
    serving_g: float | None
    piece_g: float | None = None  # we counted it in pieces last time: one piece weighs this
    image_url: str | None
    per100: NutrientsOut | None  # None: OFF has no energy value, the user types the label
    kind: SnackKind  # guessed from OFF's categories and the sugar
    remembered: bool = False  # our values from the last time we logged it
    meal_id: int | None = None  # in our snacks: logging it updates that product meal
    source: str = "Open Food Facts"
    ingredient: IngredientOut | None = (
        None  # we cook with it: the ingredient made from this barcode
    )


class IngredientFromCode(BaseModel):
    """A scanned pack to cook with: its name and values per 100 g / ml as we checked them."""

    name: str = Field(min_length=1, max_length=120)
    per: Literal["100g", "100ml"] = "100g"
    per100: NutrientsIn
    piece_g: float | None = Field(default=None, gt=0, le=2000)  # counted in pieces (a tortilla)


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
            per=ours.per,
            serving_g=ours.amount,
            piece_g=ours.piece_g,
            image_url=off.get("image_url"),
            per100=ours.per100,
            kind=ours.kind,
            remembered=True,
            meal_id=ours.meal_id,
            source="Our values",
            ingredient=await our_ingredient(session, user.household_id, code),
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
    # answers cached before `kind`/`per` existed: kind guessed from the sugar, per from the pack
    kind = product.get("kind") or service.snack_kind([], product["per100"])
    per = product.get("per") or service.measure(product["quantity"], kind)
    return ProductOut(
        code=code,
        **{**product, "kind": kind, "per": per},
        ingredient=await our_ingredient(session, user.household_id, code),
    )


async def our_ingredient(session, household_id: int, code: str) -> IngredientOut | None:
    ingredient = await service.our_ingredient(session, household_id, code)
    return IngredientOut.of(ingredient) if ingredient else None


@router.post("/{code}/ingredient")
async def ingredient_from_barcode(
    code: Barcode, body: IngredientFromCode, session: Session, user: CurrentUser
) -> IngredientOut:
    """Add a scanned pack to a meal: it becomes our ingredient, found by its barcode next time."""
    ingredient = await service.save_ingredient(
        session,
        user.household_id,
        code,
        body.name,
        body.per,
        body.per100.model_dump(),
        body.piece_g,
    )
    await session.commit()
    return IngredientOut.of(ingredient)
