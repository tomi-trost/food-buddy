"""Run vision models over benchmark datasets and write one result row per photo.

Uses the app's own path: shrink to vision_max_px → OpenAI-compatible provider with the JSON
schema → catalog grounding. Rows are appended to a JSONL file and finished (model, prompt,
photo) triples are skipped, so a stopped run picks up where it left off.

  cd api && .venv/bin/python -m benchmark.run --data ../eval/data/nutrition5k \
      --models qwen3-vl:4b-instruct,qwen3-vl:2b-instruct --prompts v1,v2

Needs the dev database (make db) for the ingredient catalog; nothing is written to it.
"""

import argparse
import asyncio
import json
import time
from datetime import date
from pathlib import Path

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.analysis.photos import shrink_jpeg
from app.analysis.service import ground
from app.config import VisionProviderConfig, get_settings
from app.db import SessionLocal
from app.nutrition.matching import match_ingredient, normalize
from app.nutrition.seed import seed_catalog, seed_mock
from app.vision.providers import OpenAICompatibleProvider, ProviderError, image_message
from app.vision.schemas import MealAnalysis
from benchmark import dataset
from benchmark.metrics import Keyed, ingredient_scores, pct_error
from benchmark.prompts import PROMPTS

EVAL_DIR = Path(__file__).resolve().parents[2] / "eval"


class UsageLog:
    """httpx response hook keeping the token usage of the last chat answer."""

    def __init__(self):
        self.last: dict = {}

    async def __call__(self, response: httpx.Response) -> None:
        if not response.request.url.path.endswith("/chat/completions"):
            return
        await response.aread()
        try:
            self.last = response.json().get("usage") or {}
        except (ValueError, AttributeError):
            self.last = {}


def key(ingredient_id: int | None, name: str) -> str:
    return f"id:{ingredient_id}" if ingredient_id is not None else f"name:{normalize(name)}"


async def truth_keys(session: AsyncSession, sample: dataset.Sample) -> list[Keyed]:
    keyed = []
    for item in sample.items:
        match = await match_ingredient(session, item.name)
        keyed.append(Keyed(key(match.ingredient.id if match else None, item.name), item.grams))
    return keyed


async def score(session: AsyncSession, sample: dataset.Sample, answer: MealAnalysis) -> dict:
    """Ground the answer like the app does and compare it with the truth."""
    result = await ground(session, answer)
    await session.rollback()  # ground() records unmatched names; keep the dev DB clean
    predicted = [
        Keyed(key(i.ingredient.id if i.ingredient else None, i.name), i.grams) for i in result.items
    ]
    row = ingredient_scores(predicted, await truth_keys(session, sample))
    totals = result.totals.model_dump()
    for k in dataset.TOTAL_KEYS:
        row[f"{k}_pred"] = totals[k]
        row[f"{k}_err_pct"] = pct_error(totals[k], sample.totals[k])
    grams = sum(i.grams for i in answer.ingredients)
    row["mass_pred"], row["mass_err_pct"] = grams, pct_error(grams, sample.grams)
    row["unmatched"] = result.unmatched
    return row


def done_keys(out: Path) -> set[tuple[str, str, str]]:
    if not out.exists():
        return set()
    rows = [json.loads(line) for line in out.read_text().splitlines() if line.strip()]
    return {(r["model"], r["prompt"], r["sample"]) for r in rows if r.get("type") == "sample"}


def ollama_base(url: str) -> str:
    return url.rstrip("/").removesuffix("/v1")


async def loaded_models(client: httpx.AsyncClient, url: str) -> dict[str, float]:
    """Ollama's /api/ps: model → resident size in GB. Empty for servers that aren't Ollama."""
    try:
        response = await client.get(ollama_base(url) + "/api/ps", timeout=10)
        response.raise_for_status()
        return {m["name"]: m["size"] / 1e9 for m in response.json().get("models", [])}
    except (httpx.HTTPError, ValueError, KeyError, TypeError):
        return {}


async def set_keep_alive(client: httpx.AsyncClient, url: str, model: str, keep_alive) -> None:
    """Load (keep_alive=-1) or unload (0) a model on Ollama; ignored elsewhere."""
    try:
        await client.post(
            ollama_base(url) + "/api/generate",
            json={"model": model, "keep_alive": keep_alive},
            timeout=600,
        )
    except httpx.HTTPError:
        pass


async def run_model(
    args, client: httpx.AsyncClient, usage: UsageLog, model: str, samples, out: Path
) -> None:
    finished = done_keys(out)
    todo = [
        (prompt, folder, s)
        for prompt in args.prompts
        for folder, s in samples
        if (model, prompt, s.id) not in finished
    ]
    if not todo:
        return
    resident_before = await loaded_models(client, args.url)
    await set_keep_alive(client, args.url, model, -1)  # load now so photo 1 isn't slower
    config = VisionProviderConfig(name="bench", url=args.url, model=model, timeout_s=args.timeout)
    provider = OpenAICompatibleProvider(config, client)
    ram_logged = False

    for n, (prompt, folder, sample) in enumerate(todo, 1):
        jpeg = shrink_jpeg((folder / sample.image).read_bytes(), args.max_px)
        messages = [
            {"role": "system", "content": PROMPTS[prompt]},
            image_message("Analyze this meal.", jpeg),
        ]
        usage.last = {}
        row = {"type": "sample", "model": model, "prompt": prompt, "sample": sample.id}
        row["source"], row["max_px"] = sample.source, args.max_px
        started = time.perf_counter()
        try:
            answer = await provider.chat_json(messages, MealAnalysis)
        except ProviderError as exc:
            row |= {"ok": False, "error": str(exc)[:500]}
            row["latency_s"] = round(time.perf_counter() - started, 1)
        else:
            row["latency_s"] = round(time.perf_counter() - started, 1)
            async with SessionLocal() as session:
                row |= {"ok": True, **await score(session, sample, answer)}
            row["answer"] = answer.model_dump()
        row["prompt_tokens"] = usage.last.get("prompt_tokens")
        row["completion_tokens"] = usage.last.get("completion_tokens")
        with out.open("a") as f:
            f.write(json.dumps(row) + "\n")
        kcal = row.get("kcal_err_pct")
        status = f"kcal {kcal:+.0f}%" if kcal is not None else row.get("error", "ok")[:60]
        print(f"[{model} {prompt}] {n}/{len(todo)} {sample.id}: {row['latency_s']} s, {status}")

        if not ram_logged:
            ram = (await loaded_models(client, args.url)).get(model)
            with out.open("a") as f:
                f.write(json.dumps({"type": "model", "model": model, "ram_gb": ram}) + "\n")
            ram_logged = True

    if args.unload and model not in resident_before:
        await set_keep_alive(client, args.url, model, 0)


async def main(args) -> None:
    samples = []
    for folder in args.data:
        samples += [(folder, s) for s in dataset.load(folder)[: args.limit]]
    if not samples:
        raise SystemExit("No samples found (did you build a dataset? see eval/README.md)")

    async with SessionLocal() as session:  # the catalog the app grounds with
        await seed_mock(session)
        await seed_catalog(session)
        await session.commit()

    args.out.parent.mkdir(parents=True, exist_ok=True)
    usage = UsageLog()
    async with httpx.AsyncClient(event_hooks={"response": [usage]}) as client:
        for model in args.models:
            await run_model(args, client, usage, model, samples, args.out)
    print(f"Results: {args.out}\nReport:  python -m benchmark.report {args.out}")


def parse_args(argv: list[str] | None = None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--data", type=Path, action="append", required=True)
    parser.add_argument("--models", type=lambda s: s.split(","), required=True)
    parser.add_argument("--prompts", type=lambda s: s.split(","), default=["v1"])
    parser.add_argument("--url", default="http://localhost:11434/v1")
    parser.add_argument("--limit", type=int, default=None, help="photos per dataset")
    parser.add_argument("--max-px", type=int, default=get_settings().vision_max_px)
    parser.add_argument("--timeout", type=float, default=900)
    parser.add_argument("--no-unload", dest="unload", action="store_false")
    parser.add_argument(
        "--out", type=Path, default=EVAL_DIR / "results" / f"run-{date.today()}.jsonl"
    )
    args = parser.parse_args(argv)
    unknown = set(args.prompts) - PROMPTS.keys()
    if unknown:
        parser.error(f"unknown prompts {sorted(unknown)}; known: {sorted(PROMPTS)}")
    return args


if __name__ == "__main__":
    asyncio.run(main(parse_args()))
