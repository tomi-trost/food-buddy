"""Download a random Nutrition5k subset: overhead photos + weighed ingredients.

Nutrition5k (Google, CC BY 4.0): cafeteria plates, every ingredient weighed, kcal and macros
from USDA. Only the test split's overhead RGB photos are fetched (~400 KB each), not the 181 GB
archive.

  cd api && .venv/bin/python -m benchmark.nutrition5k --n 40   # → ../eval/data/nutrition5k
"""

import argparse
import csv
import io
import random
from pathlib import Path

import httpx

from app.analysis.photos import normalize_photo
from benchmark import dataset
from benchmark.run import EVAL_DIR

BASE = "https://storage.googleapis.com/nutrition5k_dataset/nutrition5k_dataset"
METADATA = [f"{BASE}/metadata/dish_metadata_cafe{n}.csv" for n in (1, 2)]
# The depth split is the overhead camera (the rgb split is the side-angle videos).
TEST_IDS = f"{BASE}/dish_ids/splits/depth_test_ids.txt"

# Skip scraps: plates with almost nothing on them say little about a real meal.
MIN_KCAL = 100
MIN_GRAMS = 100


def photo_url(dish_id: str) -> str:
    return f"{BASE}/imagery/realsense_overhead/{dish_id}/rgb.png"


def pick(samples: list[dataset.Sample], test_ids: set[str], n: int, seed: int):
    """Test-split dishes big enough to be a meal, in a reproducible random order."""
    eligible = sorted(
        (
            s
            for s in samples
            if s.id in test_ids and s.totals["kcal"] >= MIN_KCAL and s.grams >= MIN_GRAMS
        ),
        key=lambda s: s.id,
    )
    random.Random(seed).shuffle(eligible)
    return eligible[:n] if n else eligible


def build(client: httpx.Client, out: Path, n: int, seed: int, max_px: int = 1280) -> int:
    samples = []
    for url in METADATA:
        text = client.get(url).raise_for_status().text
        samples += [dataset.parse_nutrition5k_row(r) for r in csv.reader(io.StringIO(text)) if r]
    test_ids = set(client.get(TEST_IDS).raise_for_status().text.split())

    out.mkdir(parents=True, exist_ok=True)
    kept = []
    for sample in pick(samples, test_ids, 0, seed):
        if len(kept) == n:
            break
        target = out / sample.image
        if not target.exists():
            response = client.get(photo_url(sample.id))
            if response.status_code == 404:  # a few test dishes have no overhead photo
                continue
            target.write_bytes(normalize_photo(response.raise_for_status().content, max_px))
        kept.append(sample)
        print(f"{len(kept)}/{n} {sample.id}: {sample.totals['kcal']:.0f} kcal")
    dataset.save(out, kept)
    return len(kept)


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Download a Nutrition5k subset")
    parser.add_argument("--n", type=int, default=40)
    parser.add_argument("--seed", type=int, default=5)
    parser.add_argument("--out", type=Path, default=EVAL_DIR / "data" / "nutrition5k")
    args = parser.parse_args(argv)
    with httpx.Client(timeout=60, follow_redirects=True) as client:
        build(client, args.out, args.n, args.seed)


if __name__ == "__main__":
    main()
