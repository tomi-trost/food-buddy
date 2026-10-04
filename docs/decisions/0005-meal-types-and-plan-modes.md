# 0005 — Meal types and per-slot plan modes
Date: 2026-10-04 · Status: accepted

**Context:** Both of us study; some days we meal-prep, some days we eat out. Logging and planning must reflect breakfast/lunch/dinner.
**Decision:**
- Every meal has one or more types (breakfast / lunch / dinner). Logging a meal (snap flow or "I cooked this again") picks a type; Home shows today's log grouped by type.
- The weekly plan is a 7 × 3 grid. Each slot has a mode: **Cook** (with a time budget 15/30/45/60+ min), **Meal prep** (eat from a batch, no cooking that day), **Eating out**, or **Skip**.
- Plan wizard: tap a cell to cycle through the modes. Per-slot edits (change mode/meal) via a sheet.
- Shopping list = ingredients of planned meals × batches (each slot feeds 2 people), minus fridge stock. Prep meals are batch-cooked (must be tagged `prep-friendly`).
**Alternatives:** Dinner-only plan (rejected: doesn't match how we eat).
**Consequences:** Meal data needs `types`, `tags`; generator works per type. Open: variety rules (avoid the same breakfast all week), and which day the batch is cooked.
