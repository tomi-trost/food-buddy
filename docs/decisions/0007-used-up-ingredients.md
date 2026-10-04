# 0007 — "Used up" ingredients while cooking feed the shopping list
Date: 2026-10-04 · Status: accepted

**Context:** Deducting recipe quantities from the fridge is only an estimate; we know when something actually ran out.
**Decision:** When posting a meal or logging a cook, an "Used up an ingredient?" block lets us tap ingredients we finished. They are removed from the fridge and added to the shopping list under "Ran out while cooking" (default 250 g, independent of the weekly plan). Buying them clears the flag.
**Consequences:** Fridge stock self-corrects; shopping list works even without an approved plan. Open: sensible default quantities per ingredient, and a way to un-flag.
