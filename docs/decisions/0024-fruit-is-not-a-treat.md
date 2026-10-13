# 0024 — Fruit is a snack type of its own and never a treat
Date: 2026-10-13 · Status: accepted (amends 0014)

**Context:** A pear or an apple logged as a snack came in as "Sweet" and counted as a treat: treat sugar, broken treat-free days, fewer croissants. Eating fruit isn't the habit the treat tracking is about. Marking it "Savory" kept it out of the treats but is plainly wrong.
**Decision:** A fourth snack type, **Fruit** (🍎), next to Sweet, Savory and Drink. Only Sweet and Drink are treats (`TREAT_KINDS`, `isTreatKind`); fruit adds to kcal, macros and fibre like any snack.
- Fresh and dried fruit are fruit; sweets made with fruit (jam, fruit gums, fruit cake) stay sweet; juices and smoothies stay drinks (sugar without the fibre).
- The snack photo/text/label prompts and the answer schema offer "fruit". The barcode guess says fruit for OFF's `en:fruits` / `en:fresh-fruits` / `en:dried-fruits` unless a sweet category is also there (jam).
- Apple, Pear and Banana join the quick-pick list.
**Alternatives:** A "healthy" switch on any snack (more taps, and a sweet doesn't become healthy by a switch); a sugar threshold (fruit has plenty of sugar, so it would still count).
**Consequences:** No migration (types are plain strings). Fruit logged before this stays as logged (Sweet) unless fixed by hand.
