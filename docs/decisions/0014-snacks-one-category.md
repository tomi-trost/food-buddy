# 0014 — Snacks as one category (sweets are a kind), photo + label capture
Date: 2026-10-04 · Status: accepted

**Decision:** Sweets and snacks are one "Snacks" log, not two. Each snack has a kind: **Sweet**, **Savory** or **Drink**. Sweets and sugary drinks count as *treats* (sugar goal, treat-free days, croissant rewards — see 0011/0012); savory snacks only add to kcal/macros. All snacks add to the day's totals.
**Capture options:** pick from a list, take a photo of the snack (auto-detected, adjustable type and amount), or scan the nutrition table on the back of the pack (values read per 100 g, scaled to the portion eaten).
**Alternatives:** Separate "Sweets" and "Snacks" logs (rejected: same flow, doubles the UI).
**Consequences:** Insights tab renamed Snacks. Real implementation needs a vision model for the photo and OCR/label parsing (plus barcode lookup as a fallback) — see ideas.
