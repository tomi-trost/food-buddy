# 0006 — Calmer visuals, unified line icons (revises 0002)
Date: 2026-10-04 · Status: accepted

**Context:** First mock was too colorful and rounded, with emoji used as UI icons.
**Decision:** Muted warm-neutral palette with a single accent; macro colors desaturated; small radii (6–8px, no pills); 1px borders instead of shadows. All navigation/UI icons come from one inline-SVG line icon set (`P`/`ic()` in `index.html`). Emoji are kept **only** for ingredients/dish placeholders as quick visual reference.
**Consequences:** When moving to the real stack, swap the icon set for a library with the same style (e.g. Lucide) — names already map 1:1.
