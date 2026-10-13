"""Build the ingredient catalogs in app/nutrition/data/ from the official downloads.

USDA SR Legacy (public domain):
  https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip
  python scripts/build_catalog.py usda <unzipped dir>
ANSES Ciqual 2020 (Etalab open licence, attribution "ANSES-CIQUAL"):
  https://ciqual.anses.fr/cms/sites/default/files/inline-files/XML_2020_07_07.zip
  python scripts/build_catalog.py ciqual <unzipped dir>
Everything else from both (searchable, matched only by exact generated short names):
  python scripts/build_catalog.py full <USDA dir> <Ciqual dir>

The picks live in scripts/<source>_catalog.txt, one line per ingredient:
  name | emoji | category | shelf days | aliases (comma) | USDA description or Ciqual code
"""

import csv
import difflib
import gzip
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
    foods, values, _ = ciqual_with_groups(src)
    return foods, values


def ciqual_with_groups(src: Path):
    """Like ciqual(), plus code → sub-group code (e.g. "0204" fruits)."""
    ids = {"328": "kcal", "25000": "protein", "31000": "carbs", "40000": "fat",
           "34100": "fiber", "32000": "sugar"}  # fmt: skip
    kcal_fallback = "333"  # energy with Jones' factors, for rows without the EU-regulation value
    read = lambda name: (src / name).read_text(encoding="windows-1252")  # noqa: E731
    alim = re.findall(
        r"<alim_code> (\d+) </alim_code>.*?<alim_nom_eng> (.*?) </alim_nom_eng>"
        r".*?<alim_ssgrp_code> (\d+) </alim_ssgrp_code>",
        read("alim_2020_07_07.xml"),
        re.S,
    )
    foods = {code: (code, eng) for code, eng, _ in alim}
    groups = {code: group for code, _, group in alim}
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
    return foods, values, groups


def fill_energy(v: dict[str, float]) -> bool:
    """Compute missing energy from the macros with the EU 1169/2011 label factors."""
    if "kcal" in v or not all(k in v for k in ("protein", "carbs", "fat")):
        return False
    v["kcal"] = round(4 * v["protein"] + 4 * v["carbs"] + 9 * v["fat"] + 2 * v.get("fiber", 0))
    return True


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
            if fill_energy(v):
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


# --- Full import ----------------------------------------------------------------------------
# Every other row of both sources, for the ingredient search. Matching only uses the short
# names generated below, only when exactly one row produces them and no hand-picked row
# already answers them: a wrong match is worse than none (decision 0022).

FULL_COLUMNS = ["source", "ref", "name", "emoji", "category", "shelf_days", "aliases",
                *REQUIRED, *OPTIONAL]  # fmt: skip
SHELF_DAYS = {"Meat": 3, "Produce": 7, "Dairy": 10, "Pantry": 180}

# USDA food_category_id → (our category, emoji, eaten cooked). None = left out entirely.
USDA_CATEGORIES: dict[str, tuple[str, str, bool] | None] = {
    "1": ("Dairy", "🥛", False), "2": ("Pantry", "🌿", False), "3": None,
    "4": ("Pantry", "🫒", False), "5": ("Meat", "🍗", True), "6": ("Pantry", "🥣", False),
    "7": ("Meat", "🌭", False), "8": ("Pantry", "🥣", False), "9": ("Produce", "🍎", False),
    "10": ("Meat", "🥓", True), "11": ("Produce", "🥦", False), "12": ("Pantry", "🥜", False),
    "13": ("Meat", "🥩", True), "14": ("Pantry", "🥤", False), "15": ("Meat", "🐟", True),
    "16": ("Pantry", "🫘", True), "17": ("Meat", "🍖", True), "18": ("Pantry", "🍞", False),
    "19": ("Pantry", "🍬", False), "20": ("Pantry", "🌾", True), "21": ("Pantry", "🍔", False),
    "22": ("Pantry", "🍲", False), "23": ("Pantry", "🍿", False), "24": None,
    "25": ("Pantry", "🍽️", False), "26": None, "27": None, "28": ("Pantry", "🍷", False),
}  # fmt: skip
USDA_NO_ALIASES = {"21", "25"}  # fast food and restaurant chains: brand names, not ingredients

# Ciqual sub-group → (our category, emoji, eaten cooked); group prefix as fallback.
CIQUAL_GROUPS: dict[str, tuple[str, str, bool] | None] = {
    "01": ("Meat", "🍲", False), "0104": ("Pantry", "🍕", False),
    "0201": ("Produce", "🥦", False), "0202": ("Produce", "🥔", False),
    "0203": ("Pantry", "🫘", True), "0204": ("Produce", "🍎", False),
    "0205": ("Pantry", "🥜", False), "0301": ("Pantry", "🌾", True),
    "0302": ("Pantry", "🍞", False), "0303": ("Pantry", "🥨", False),
    "04": ("Meat", "🍖", True), "0403": ("Meat", "🥓", False), "0405": ("Meat", "🐟", True),
    "0406": ("Meat", "🐟", True), "0407": ("Meat", "🦐", True), "0408": ("Meat", "🦐", True),
    "0409": ("Meat", "🐟", False), "0410": ("Dairy", "🥚", False), "0411": ("Pantry", "🌱", False),
    "05": ("Dairy", "🥛", False), "0503": ("Dairy", "🧀", False),
    "06": ("Pantry", "🥤", False), "0601": None, "0603": ("Pantry", "🍷", False),
    "07": ("Pantry", "🍬", False), "0702": ("Pantry", "🍫", False),
    "0706": ("Pantry", "🍪", False), "0707": ("Pantry", "🥣", False),
    "0709": ("Pantry", "🍰", False), "08": ("Dairy", "🍨", False),
    "09": ("Pantry", "🫒", False), "0901": ("Dairy", "🧈", False),
    "10": ("Pantry", "🧂", False), "1006": ("Produce", "🌿", False), "11": None,
}  # fmt: skip

COOKED = {"cooked", "boiled", "roasted", "baked", "roasted/baked", "grilled", "broiled",
          "braised", "steamed", "pan-fried", "stewed", "simmered", "dry heat",
          "moist heat"}  # fmt: skip
FILLER = {"drained", "without salt", "with salt", "unsalted", "fresh", "plain", "edible portion",
          "all varieties", "all types", "includes skin", "mature seeds", "sliced", "prepacked",
          "homemade", "home-made", "ready-to-serve", "ready-to-eat",
          "commercially prepared"}  # fmt: skip
HEADINGS = {"spices", "snacks"}  # USDA group words: "Spices, paprika" is just paprika
BRAND = re.compile(r"\b[A-Z][A-Z'&.]{2,}")  # KRAFT, McDONALD'S


def _variants(base: str) -> set[str]:
    """The name plus a naive singular/plural of its last word ("blackberries" ↔ "blackberry")."""
    head, _, last = base.rpartition(" ")
    forms = {last}
    if last.endswith("ies"):
        forms.add(last[:-3] + "y")
    elif last.endswith("oes"):
        forms.add(last[:-2])
    elif last.endswith("s") and not last.endswith("ss"):
        forms.add(last[:-1])
    elif last.endswith("y") and last[-2:-1] not in "aeiou":
        forms.add(last[:-1] + "ies")
    elif last.endswith(("o", "ch", "sh")):
        forms.add(last + "es")
    else:
        forms.add(last + "s")
    return {f"{head} {f}".strip() for f in forms if len(f) > 2}


def short_names(description: str, eaten_cooked: bool) -> set[str]:
    """Names the vision model would use for one database row, or none if it's too specific.

    "Blackberries, raw" → blackberries, raw blackberries (+ singular); "Cheese, cheddar" →
    cheddar cheese; "Lentils, mature seeds, cooked, boiled, without salt" → lentils, cooked
    lentils, boiled lentils. Foods eaten cooked (meat, fish, grains, legumes) only get the plain
    name from a cooked row, everything else from a raw or unqualified one.
    """
    text = re.sub(r"\([^)]*\)", "", description).lower()
    parts = [" ".join(p.split()) for p in text.split(",") if p.strip()]
    states = [p for p in parts if p in COOKED or p == "raw"]
    core = [p for p in parts if p not in COOKED and p != "raw" and p not in FILLER]
    if len(core) > 1 and core[0] in HEADINGS:
        core = core[1:]
    if len(core) == 1:
        base = core[0]
    elif len(core) == 2 and len(core[1].split()) <= 2:
        base = f"{core[1]} {core[0]}"
    else:
        return set()
    if len(base.split()) > 4 or not re.fullmatch(r"[a-z' -]+", base):
        return set()

    cooked = [s for s in states if s in COOKED]
    names: set[str] = set()
    if cooked:
        for s in ["cooked", *cooked]:
            if " " not in s and "/" not in s:
                names.add(f"{s} {base}")
        if eaten_cooked:
            names.add(base)
    elif "raw" in states:
        names.add(f"raw {base}")
        if not eaten_cooked:
            names.add(base)
    else:
        names.add(base)
    return {v for n in names for v in _variants(n)}


def _curated() -> tuple[set[tuple[str, str]], set[tuple[str, str]], set[str]]:
    """(source, ref) and (source, lowercase name) of the hand-picked catalog rows, and every
    name and alias of the hand-picked and mock rows."""
    sys.path.insert(0, str(HERE.parent))
    from app.nutrition.seed import MOCK_INGREDIENTS

    refs, names = set(), set()
    terms = {t for i in MOCK_INGREDIENTS for t in (i.name.lower(), *i.aliases)}
    for source in ("usda", "ciqual"):
        with open(DATA / f"{source}_catalog.csv", newline="", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                refs.add((source, r["ref"]))
                names.add((source, r["name"].lower()))
                terms |= {r["name"].lower(), *(a for a in r["aliases"].split(",") if a)}
    return refs, names, terms


def _covered(alias: str, curated_terms: set[str]) -> bool:
    """A hand-picked row already answers this name ("cooked brown rice" → Brown rice)."""
    first, _, rest = alias.partition(" ")
    return alias in curated_terms or (first in COOKED | {"raw"} and rest in curated_terms)


def full(usda_dir: Path, ciqual_dir: Path) -> None:
    curated_refs, curated_names, curated_terms = _curated()
    rows: list[dict] = []

    def add(source, ref, name, kind, v, allow_aliases):
        category, emoji, eaten_cooked = kind
        if (source, ref) in curated_refs or (source, name.lower()) in curated_names:
            return
        fill_energy(v)
        if any(k not in v for k in REQUIRED):
            return
        rows.append({
            "source": source, "ref": ref, "name": name, "emoji": emoji, "category": category,
            "shelf_days": SHELF_DAYS[category],
            "aliases": short_names(name, eaten_cooked) if allow_aliases else set(),
            **{k: v.get(k, 0.0) for k in (*REQUIRED, *OPTIONAL)},
        })  # fmt: skip

    foods, values = usda(usda_dir)
    with open(usda_dir / "food.csv", newline="") as f:
        category_of = {r["fdc_id"]: r["food_category_id"] for r in csv.DictReader(f)}
    for fdc_id, description in foods.values():
        cat = category_of[fdc_id]
        if kind := USDA_CATEGORIES.get(cat):
            allow = cat not in USDA_NO_ALIASES and not BRAND.search(description)
            add("usda", fdc_id, description, kind, values.get(fdc_id, {}), allow)

    foods, values, groups = ciqual_with_groups(ciqual_dir)
    for code, eng in foods.values():
        group = groups[code]
        kind = CIQUAL_GROUPS.get(group, CIQUAL_GROUPS.get(group[:2]))
        if kind and eng.strip() not in ("", "-"):
            add("ciqual", code, eng.strip(), kind, values.get(code, {}), True)

    # Names are unique per source in the table: suffix the rare duplicate with its reference.
    seen: dict[tuple[str, str], int] = {}
    for r in rows:
        seen[(r["source"], r["name"].lower())] = seen.get((r["source"], r["name"].lower()), 0) + 1
    for r in rows:
        if seen[(r["source"], r["name"].lower())] > 1:
            r["name"] = f"{r['name']} [{r['ref']}]"

    # A short name made by two rows of a source is ambiguous: dropped. Across sources USDA
    # (the base table) wins over Ciqual.
    owners: dict[str, set[tuple[str, str]]] = {}
    for r in rows:
        for a in r["aliases"]:
            owners.setdefault(a, set()).add((r["source"], r["ref"]))
    kept = 0
    for r in rows:
        mine = (r["source"], r["ref"])
        aliases = []
        for a in sorted(r["aliases"]):
            if _covered(a, curated_terms):
                continue
            others = owners[a] - {mine}
            if any(s == r["source"] for s, _ in others):
                continue
            if r["source"] == "ciqual" and any(s == "usda" for s, _ in others):
                continue
            aliases.append(a)
        r["aliases"] = ",".join(aliases)
        kept += len(aliases)

    out_path = DATA / "full_foods.csv.gz"
    with gzip.open(out_path, "wt", newline="", encoding="utf-8") as f:
        out = csv.DictWriter(f, FULL_COLUMNS)
        out.writeheader()
        out.writerows(sorted(rows, key=lambda r: (r["source"], int(r["ref"]))))
    print(f"{len(rows)} foods, {kept} short names → {out_path}")


if __name__ == "__main__":
    if sys.argv[1] == "full":
        full(Path(sys.argv[2]), Path(sys.argv[3]))
    else:
        main(sys.argv[1], Path(sys.argv[2]))
