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

## Update (2026-10-24): plates and families that learn
- New built-in family **Protein & veg plates**: a protein (chicken, fish, tofu…) with vegetables
  (potatoes count) on a plate whose heaviest part isn't pasta, rice, bread or oats. Checked after
  the dish-type rules, before Potatoes and Meat & fish. Gnocchi count as Potatoes.
- **Families we make learn**: from 2 meals we put in a family ourselves, it keeps the name words
  and main ingredients (3 heaviest) that at least half of them share. A meal we didn't pick is
  guessed into the learned family it best matches, if it has at least two thirds of what that
  family learned (and at least 2 things); learned families are checked before the built-in rules.
- Learning uses only our own picks, never guesses. Keywords can be switched off per family
  (`family_block`, `PUT /api/families/blocks`), shown in "By dish" when the family is open.
- One family per meal (no meal in two rows); a Base / Protein label is a possible later addition.

## Alternatives
- Ask the vision model for a family: slower on 2 cores and inconsistent names; maybe later as a
  suggestion for meals the rules call Other.
- Cluster by ingredient overlap: harder to explain and to correct.

## Consequences
- Rules are English keywords (plus a few Slovenian ones); a wrong guess is fixed per meal in Edit meal.
