"""Markdown table from benchmark result files, one line per model + prompt (+ source).

python -m benchmark.report ../eval/results/run-2026-10-12.jsonl [--by-source]
"""

import argparse
import json
from pathlib import Path

from benchmark.metrics import summarize

COLUMNS = [
    ("n", "n", "{:.0f}"),
    ("valid_pct", "JSON ok", "{:.0f}%"),
    ("precision", "ingr. P", "{:.2f}"),
    ("recall", "ingr. R", "{:.2f}"),
    ("mass_recall", "mass R", "{:.2f}"),
    ("kcal_abs_pct", "kcal err", "{:.0f}%"),
    ("kcal_bias_pct", "kcal bias", "{:+.0f}%"),
    ("protein_abs_pct", "prot err", "{:.0f}%"),
    ("carbs_abs_pct", "carb err", "{:.0f}%"),
    ("fat_abs_pct", "fat err", "{:.0f}%"),
    ("mass_abs_pct", "grams err", "{:.0f}%"),
    ("latency_s", "latency", "{:.0f} s"),
    ("latency_p90_s", "p90", "{:.0f} s"),
    ("completion_tokens", "out tok", "{:.0f}"),
    ("ram_gb", "RAM", "{:.1f} GB"),
]


def read_rows(paths: list[Path]) -> tuple[list[dict], dict[str, float]]:
    samples, ram = [], {}
    for path in paths:
        for line in path.read_text().splitlines():
            if not line.strip():
                continue
            row = json.loads(line)
            if row.get("type") == "model" and row.get("ram_gb") is not None:
                ram[row["model"]] = row["ram_gb"]
            elif row.get("type") == "sample":
                samples.append(row)
    return samples, ram


def table(samples: list[dict], ram: dict[str, float], by_source: bool = False) -> str:
    groups: dict[tuple, list[dict]] = {}
    for row in samples:
        group = (row["model"], row["prompt"]) + ((row["source"],) if by_source else ())
        groups.setdefault(group, []).append(row)

    head = ["model", "prompt"] + (["source"] if by_source else []) + [c[1] for c in COLUMNS]
    lines = ["| " + " | ".join(head) + " |", "|" + "---|" * len(head)]
    for group, rows in sorted(groups.items()):
        summary = summarize(rows) | {"ram_gb": ram.get(group[0])}
        cells = [fmt.format(summary[k]) if summary[k] is not None else "–" for k, _, fmt in COLUMNS]
        lines.append("| " + " | ".join([*group, *cells]) + " |")
    return "\n".join(lines)


LEGEND = """\
ingr. P/R: share of named ingredients that were really there / of real ingredients ≥ 5 g that
were named (both after catalog matching); mass R: recall weighted by grams. Errors are medians
of |predicted − true| / true over photos with a valid answer; kcal bias is the median signed
error (negative = underestimates). Latency includes the first photo after loading the model."""


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Summarize benchmark results")
    parser.add_argument("results", type=Path, nargs="+")
    parser.add_argument("--by-source", action="store_true")
    args = parser.parse_args(argv)
    samples, ram = read_rows(args.results)
    print(table(samples, ram, args.by_source))
    print()
    print(LEGEND)


if __name__ == "__main__":
    main()
