"""Our own meals as benchmark samples: posted meals with a photo, truth = the corrected plate.

The truth is what we saved after correcting the model (grams per plate, per-portion nutrition),
so it is only as good as our corrections: weigh the plate before posting to make a meal count.

  cd api && .venv/bin/python -m benchmark.household              # from the VM (ssh food-buddy)
  cd api && .venv/bin/python -m benchmark.household --local      # from the dev database

Photos land in eval/data/household (gitignored, never committed).
"""

import argparse
import base64
import json
import subprocess
import sys
from pathlib import Path

from benchmark import dataset, household_dump
from benchmark.run import EVAL_DIR

REMOTE = "cd /opt/food-buddy/deploy && docker compose exec -T api python -"


def write(lines: list[str], out: Path) -> int:
    out.mkdir(parents=True, exist_ok=True)
    samples = []
    for line in lines:
        if not line.startswith("{"):
            continue
        data = json.loads(line)
        (out / data["image"]).write_bytes(base64.b64decode(data.pop("jpeg")))
        samples.append(dataset.Sample.from_dict(data))
    dataset.save(out, samples)
    return len(samples)


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Export our posted meals as benchmark samples")
    parser.add_argument("--local", action="store_true", help="read the dev database instead")
    parser.add_argument("--host", default="food-buddy")
    parser.add_argument("--out", type=Path, default=EVAL_DIR / "data" / "household")
    args = parser.parse_args(argv)
    if args.local:
        command, script = [sys.executable, "-m", "benchmark.household_dump"], None
    else:
        command, script = ["ssh", args.host, REMOTE], Path(household_dump.__file__).read_text()
    done = subprocess.run(command, input=script, capture_output=True, text=True, check=True)
    print(f"{write(done.stdout.splitlines(), args.out)} meals → {args.out}")


if __name__ == "__main__":
    main()
