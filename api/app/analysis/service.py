"""Turn a photo into a grounded analysis: vision model → ingredient matching → macros."""

from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession

from app.analysis.models import AnalysisJob
from app.analysis.schemas import AnalysisItem, AnalysisResult, MatchedIngredient
from app.nutrition.macros import total
from app.nutrition.matching import match_ingredient
from app.nutrition.schemas import IngredientOut, NutrientsOut
from app.snacks.schemas import LabelAnswer, SnackPhotoAnswer, SnackResult
from app.vision.providers import AllProvidersFailed, VisionChain, image_message
from app.vision.schemas import MealAnalysis
from app.vision.snack_prompts import LABEL_PROMPT, SNACK_PHOTO_PROMPT


async def ground(session: AsyncSession, analysis: MealAnalysis) -> AnalysisResult:
    items: list[AnalysisItem] = []
    matched_nutrients = []
    for detected in analysis.ingredients:
        match = await match_ingredient(session, detected.name)
        if match is None:
            items.append(
                AnalysisItem(
                    name=detected.name,
                    grams=detected.grams,
                    confidence=detected.confidence,
                    ingredient=None,
                    nutrients=None,
                )
            )
            continue
        per100 = match.ingredient.per100
        nutrients = per100.scaled(detected.grams)
        matched_nutrients.append(nutrients)
        items.append(
            AnalysisItem(
                name=detected.name,
                grams=detected.grams,
                confidence=detected.confidence,
                ingredient=MatchedIngredient(
                    **IngredientOut.of(match.ingredient).model_dump(), score=round(match.score, 2)
                ),
                nutrients=NutrientsOut(**nutrients.rounded()),
            )
        )
    return AnalysisResult(
        dish=analysis.dish,
        meal_type=analysis.meal_type,
        servings=analysis.servings,
        items=items,
        totals=NutrientsOut(**total(matched_nutrients).rounded()),
        unmatched=sum(1 for i in items if i.ingredient is None),
    )


async def run_analysis(
    session: AsyncSession, job_id: int, chain: VisionChain, photo_dir: Path
) -> AnalysisJob:
    job = await session.get(AnalysisJob, job_id)
    if job is None:
        raise LookupError(f"AnalysisJob {job_id} not found")
    if job.status not in ("queued", "running"):
        return job  # already processed (e.g. job retried after success)

    job.status = "running"
    await session.commit()

    jpeg = (photo_dir / job.photo_path).read_bytes()
    try:
        if job.kind == "meal":
            provider, analysis = await chain.analyze_meal(jpeg)
            job.raw = analysis.model_dump()
            job.result = (await ground(session, analysis)).model_dump()
        else:
            provider, snack = await analyze_snack(chain, job.kind, jpeg)
            job.raw = snack.model_dump()
            job.result = snack_result(snack).model_dump()
    except AllProvidersFailed as exc:
        job.status, job.error = "failed", str(exc)
    else:
        job.provider = provider
        job.status = "done"
    job.finished_at = datetime.now(UTC)
    await session.commit()
    return job


async def analyze_snack(chain: VisionChain, kind: str, jpeg: bytes):
    if kind == "label":
        messages = [
            {"role": "system", "content": LABEL_PROMPT},
            image_message("Read this label.", jpeg),
        ]
        return await chain.chat_json(messages, LabelAnswer)
    messages = [
        {"role": "system", "content": SNACK_PHOTO_PROMPT},
        image_message("What snack is this?", jpeg),
    ]
    return await chain.chat_json(messages, SnackPhotoAnswer)


DEFAULT_LABEL_PORTION_G = 45  # a typical bar/pack portion; the user adjusts it


def snack_result(answer: SnackPhotoAnswer | LabelAnswer) -> SnackResult:
    if isinstance(answer, LabelAnswer):
        factor = 100 / answer.values_per_grams
        per_100g = {k: round(v * factor, 1) for k, v in answer.values.model_dump().items()}
        printed_serving = answer.values_per_grams != 100
        return SnackResult(
            name=answer.name,
            kind=answer.kind,
            per="100g",
            amount=answer.values_per_grams if printed_serving else DEFAULT_LABEL_PORTION_G,
            per_unit=per_100g,
        )
    return SnackResult(
        name=answer.name,
        kind=answer.kind,
        per="piece",
        amount=answer.pieces,
        per_unit=answer.per_piece,
    )
