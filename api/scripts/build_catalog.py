"""Build the ingredient catalogs in app/nutrition/data/ from the official downloads.

USDA SR Legacy (public domain):
  https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip
  python scripts/build_catalog.py usda <unzipped dir>
ANSES Ciqual 2020 (Etalab open licence, attribution "ANSES-CIQUAL"):
  https://ciqual.anses.fr/cms/sites/default/files/inline-files/XML_2020_07_07.zip
  python scripts/build_catalog.py ciqual <unzipped dir>

The picks live in scripts/<source>_catalog.txt, one line per ingredient:
  name | emoji | category | shelf days | aliases (comma) | USDA description or Ciqual code
"""

import csv
import difflib
import re
import sys
from pathlib import Path

HERE = Path(__file__).parent
DATA = HERE.parent / "app" / "nutrition" / "data"
REQUIRED = ("kcal", "protein", "carbs", "fat")
OPTIONAL = ("fiber", "sugar")  # missing in some rows (meat, fish, oils): counted as 0, printed
COLUMNS = ["name", "emoji", "category", "shelf_days", "aliases", "ref", "description",
           *REQUIRED, *OPTIONAL]  # fmt: skip


def spec_rows(source: str):
    for line in (HERE / f"{source}_catalog.txt").read_text().splitlines():
        if not line.strip() or line.startswith("#"):
            continue
        name, emoji, category, shelf, aliases, key = (p.strip() for p in line.split("|"))
        yield {
            "name": name,
            "emoji": emoji,
            "category": category,
            "shelf_days": int(shelf),
            "aliases": [a.strip().lower() for a in aliases.split(",") if a.strip()],
            "key": key,
        }


def usda(src: Path) -> tuple[dict[str, tuple[str, str]], dict[str, dict[str, float]]]:
    """description → (fdc_id, description); fdc_id → values"""
    ids = {"1008": "kcal", "1003": "protein", "1005": "carbs", "1004": "fat",
           "1079": "fiber", "2000": "sugar"}  # fmt: skip
    with open(src / "food.csv", newline="") as f:
        foods = {r["description"]: (r["fdc_id"], r["description"]) for r in csv.DictReader(f)}
    values: dict[str, dict[str, float]] = {}
    with open(src / "food_nutrient.csv", newline="") as f:
        for r in csv.DictReader(f):
            if r["nutrient_id"] in ids:
                values.setdefault(r["fdc_id"], {})[ids[r["nutrient_id"]]] = float(r["amount"])
    return foods, values


def _ciqual_number(text: str) -> float | None:
    text = text.strip()
    if text == "-":
        return None
    if text == "traces" or text.startswith("<"):
        return 0.0
    return float(text.replace(",", "."))


def ciqual(src: Path) -> tuple[dict[str, tuple[str, str]], dict[str, dict[str, float]]]:
    """code → (code, English name); code → values"""
    ids = {"328": "kcal", "25000": "protein", "31000": "carbs", "40000": "fat",
           "34100": "fiber", "32000": "sugar"}  # fmt: skip
    kcal_fallback = "333"  # energy with Jones' factors, for rows without the EU-regulation value
    read = lambda name: (src / name).read_text(encoding="windows-1252")  # noqa: E731
    foods = {
        code: (code, eng)
        for code, eng in re.findall(
            r"<alim_code> (\d+) </alim_code>.*?<alim_nom_eng> (.*?) </alim_nom_eng>",
            read("alim_2020_07_07.xml"),
            re.S,
        )
    }
    values: dict[str, dict[str, float]] = {}
    compo = re.findall(
        r"<alim_code> (\d+) </alim_code>\s*<const_code> (\d+) </const_code>\s*"
        r"<teneur>(.*?)</teneur>",
        read("compo_2020_07_07.xml"),
    )
    fallback: dict[str, float] = {}
    for code, const, amount in compo:
        if (number := _ciqual_number(amount)) is None:
            continue
        if const in ids:
            values.setdefault(code, {})[ids[const]] = number
        elif const == kcal_fallback:
            fallback[code] = number
    for code, kcal in fallback.items():
        values.setdefault(code, {}).setdefault("kcal", kcal)
    return foods, values


def main(source: str, src: Path) -> None:
    foods, values = {"usda": usda, "ciqual": ciqual}[source](src)
    rows, missing = list(spec_rows(source)), []
    for row in rows:
        if row["key"] not in foods:
            close = difflib.get_close_matches(row["key"], foods, n=4, cutoff=0.5)
            missing.append(f"{row['name']}: {row['key']!r}\n    try: {close}")
    if missing:
        sys.exit(f"Not in {source}:\n" + "\n".join(missing))

    out_path = DATA / f"{source}_catalog.csv"
    with open(out_path, "w", newline="", encoding="utf-8") as f:
        out = csv.DictWriter(f, COLUMNS)
        out.writeheader()
        for row in rows:
            ref, description = foods[row.pop("key")]
            v = values.get(ref, {})
            if "kcal" not in v and all(k in v for k in ("protein", "carbs", "fat")):
                # EU 1169/2011 label factors, as printed on packs
                v["kcal"] = round(
                    4 * v["protein"] + 4 * v["carbs"] + 9 * v["fat"] + 2 * v.get("fiber", 0)
                )
                print(f"  {row['name']}: no energy value, computed {v['kcal']} kcal from macros")
            if lacking := [k for k in REQUIRED if k not in v]:
                sys.exit(f"{row['name']}: {source} row {ref} lacks {lacking}")
            if zeroed := [k for k in OPTIONAL if k not in v]:
                print(f"  {row['name']} ({row['category']}): no {', '.join(zeroed)} → 0")
            out.writerow(
                row
                | {"aliases": ",".join(row["aliases"]), "ref": ref, "description": description}
                | {k: v.get(k, 0.0) for k in (*REQUIRED, *OPTIONAL)}
            )
    print(f"{len(rows)} ingredients → {out_path}")


if __name__ == "__main__":
    main(sys.argv[1], Path(sys.argv[2]))
