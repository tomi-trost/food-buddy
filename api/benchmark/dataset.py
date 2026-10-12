"""Benchmark samples: one photo plus what was really on the plate.

A dataset is a folder with photos and a manifest.jsonl, one Sample per line. Image paths are
relative to the folder.
"""

import json
from dataclasses import asdict, dataclass, field
from pathlib import Path

MANIFEST = "manifest.jsonl"
TOTAL_KEYS = ("kcal", "protein", "carbs", "fat")


@dataclass(frozen=True)
class TruthItem:
    name: str
    grams: float


@dataclass(frozen=True)
class Sample:
    id: str
    image: str
    source: str  # nutrition5k | household
    items: list[TruthItem]
    totals: dict[str, float]  # TOTAL_KEYS for what the photo shows
    dish: str = ""
    notes: dict = field(default_factory=dict)

    @property
    def grams(self) -> float:
        return sum(i.grams for i in self.items)

    @staticmethod
    def from_dict(data: dict) -> "Sample":
        return Sample(
            id=data["id"],
            image=data["image"],
            source=data["source"],
            items=[TruthItem(i["name"], float(i["grams"])) for i in data["items"]],
            totals={k: float(data["totals"][k]) for k in TOTAL_KEYS},
            dish=data.get("dish", ""),
            notes=data.get("notes", {}),
        )


def load(folder: Path) -> list[Sample]:
    lines = (folder / MANIFEST).read_text().splitlines()
    return [Sample.from_dict(json.loads(line)) for line in lines if line.strip()]


def save(folder: Path, samples: list[Sample]) -> None:
    folder.mkdir(parents=True, exist_ok=True)
    text = "".join(json.dumps(asdict(s), ensure_ascii=False) + "\n" for s in samples)
    (folder / MANIFEST).write_text(text)


def parse_nutrition5k_row(row: list[str]) -> Sample:
    """One line of Nutrition5k's dish_metadata_cafe*.csv.

    Columns: dish_id, total kcal, total mass, fat, carb, protein, then per ingredient
    (id, name, grams, kcal, fat, carb, protein).
    """
    dish_id, kcal, _mass, fat, carbs, protein, *rest = row
    items = []
    for start in range(0, len(rest) - 6, 7):
        name, grams = rest[start + 1].strip(), rest[start + 2].strip()
        if name and grams:
            items.append(TruthItem(name, round(float(grams), 1)))
    totals = {"kcal": kcal, "protein": protein, "carbs": carbs, "fat": fat}
    return Sample(
        id=dish_id,
        image=f"{dish_id}.jpg",
        source="nutrition5k",
        items=items,
        totals={k: round(float(v), 1) for k, v in totals.items()},
    )
