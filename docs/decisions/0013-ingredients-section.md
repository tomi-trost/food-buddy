# 0013 — "Ingredients" section with Fridge and Pantry
Date: 2026-10-04 · Status: accepted

**Decision:** The Fridge tab is renamed **Ingredients** (basket icon) with two sections: Fridge (perishables, short expiry) and Pantry (dry/canned goods: pasta, rice, lentils, canned tomatoes; shown with month-level expiry). Section is derived from the ingredient category. Taking an ingredient to 0 with the minus button asks "Have you used it up?": *Yes* removes it and adds it to the shopping list; *Just remove* only removes it; *Keep it* cancels.
**Alternatives considered:** "Stock" or "Kitchen" as shorter names — "Ingredients" fits the tab bar, so kept.
**Consequences:** Route is `#/ingredients`; the internal store is still `S.fridge` (rename when implementing). Freezer could be a third section later.
