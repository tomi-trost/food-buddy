# 0026 — Effort and filling as 7-step sliders; stars show taste; snacks rated on taste only

**Status:** accepted (2026-10-24) · revises 0003, 0009

## Context
"Worth the effort" (yes/meh/no) and "How filling" (hungry/right/heavy) were too coarse. The
star number on cards was the mean of taste, make again and effort, so a 5-star meal could show
4.8 and looked like a bug. Snacks went through the meal rating, asking about effort and
fullness for food nobody cooked.

## Decision
- Effort and fill are sliders from −3 to +3 with 0 in the middle ("meh" / "just right").
  Stored as smallint; migration 0024 maps 1/3/5 → −3/0/+3 and hungry/right/heavy → −2/0/+2.
- Stars everywhere show the **average taste** (`taste` on meal cards and details).
- The combined `score` stays for sorting, the Top filter and the weekly menu:
  mean of taste, again and effort mapped onto 1–5 (`3 + effort × 2/3`).
- Snack-only meals (`types == ['snack']`) and snack photos are rated on taste and
  "Have it again?" only: effort and fill are empty, the score is the mean of taste and again.

## Alternatives
- Keep "make again" in the stars: rejected by Tomi; the stars should mean taste.
- Separate snack rating table: unnecessary, empty sliders are enough.

## Consequences
- Old ratings keep their meaning; "Too heavy" from before becomes +2, not +3.
- A snack-photo rating posted as a lunch gets the sliders in the middle (0).
