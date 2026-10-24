# 0028 — Dish families group variations of the same dish

**Status:** accepted (2026-10-24)

## Context
Pasta with pesto, pomodoro or tuna, or chia with different fruit, filled Meals as separate
cards. We wanted to see "Pasta · 6 variations" at a glance.

## Decision
- Every meal has a family: the one we typed in Edit meal (`meal.family`), else a guess by
  keyword from the name, then from the three heaviest ingredients (`app/meals/families.py`,
  ~15 families such as Pasta, Oats & chia, Rice & grains, Eggs, Sandwiches & wraps; no match = Other).
- Guessed on every read, never stored, so better rules apply to old meals too; emptying the field
  goes back to the guess.
- Meals → "By dish" shows one row per family (biggest first, Other last) with how many
  variations and the best taste; tapping opens its cards. Filters and sort still apply.

## Alternatives
- Ask the vision model for a family: slower on 2 cores and inconsistent names; maybe later as a
  suggestion for meals the rules call Other.
- Cluster by ingredient overlap: harder to explain and to correct.

## Consequences
- Rules are English keywords (plus a few Slovenian ones); a wrong guess is fixed per meal in Edit meal.
