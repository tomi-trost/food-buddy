"""Scoring one model answer against the truth, and summing up many. Pure functions, no I/O.

Ingredients are compared by key: the catalog ingredient both names match to, else the
normalized name itself. That is what matters in the app: "grilled chicken" and "chicken breast"
both land on Chicken breast.
"""

import statistics
from dataclasses import dataclass

# Truth items lighter than this (a pinch of parsley, a drop of vinegar) don't count against
# recall: nobody expects them from a photo. Naming them still counts as correct.
MIN_TRUTH_GRAMS = 5.0


@dataclass(frozen=True)
class Keyed:
    key: str
    grams: float


def ingredient_scores(predicted: list[Keyed], truth: list[Keyed]) -> dict[str, float | None]:
    """Precision, recall and mass-weighted recall over ingredient keys."""
    truth_keys = {t.key for t in truth}
    significant: dict[str, float] = {}
    for t in truth:
        if t.grams >= MIN_TRUTH_GRAMS:
            significant[t.key] = significant.get(t.key, 0) + t.grams
    predicted_keys = {p.key for p in predicted}

    precision = len(predicted_keys & truth_keys) / len(predicted_keys) if predicted_keys else None
    if not significant:
        return {"precision": precision, "recall": None, "mass_recall": None}
    found = predicted_keys & significant.keys()
    return {
        "precision": precision,
        "recall": len(found) / len(significant),
        "mass_recall": sum(significant[k] for k in found) / sum(significant.values()),
    }


def pct_error(predicted: float, truth: float, floor: float = 1.0) -> float | None:
    """Signed error in percent of the truth; None when the truth is too small to divide by."""
    if truth < floor:
        return None
    return (predicted - truth) / truth * 100


def _values(rows: list[dict], key: str) -> list[float]:
    return [r[key] for r in rows if r.get(key) is not None]


def _median(values: list[float]) -> float | None:
    return statistics.median(values) if values else None


def _mean(values: list[float]) -> float | None:
    return statistics.fmean(values) if values else None


def _p90(values: list[float]) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, round(0.9 * (len(ordered) - 1)))]


def summarize(rows: list[dict]) -> dict[str, float | None]:
    """One line of the report for the result rows of one model + prompt."""
    ok = [r for r in rows if r["ok"]]
    summary: dict[str, float | None] = {
        "n": len(rows),
        "valid_pct": 100 * len(ok) / len(rows) if rows else None,
        "precision": _mean(_values(ok, "precision")),
        "recall": _mean(_values(ok, "recall")),
        "mass_recall": _mean(_values(ok, "mass_recall")),
        "kcal_bias_pct": _median(_values(ok, "kcal_err_pct")),
        "latency_s": _median(_values(rows, "latency_s")),
        "latency_p90_s": _p90(_values(rows, "latency_s")),
        "completion_tokens": _median(_values(ok, "completion_tokens")),
    }
    for key in ("kcal", "protein", "carbs", "fat", "mass"):
        summary[f"{key}_abs_pct"] = _median([abs(v) for v in _values(ok, f"{key}_err_pct")])
    return summary
