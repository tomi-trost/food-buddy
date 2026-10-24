# 0029 — Bundles: a plate can hold dishes of ours

**Status:** accepted (2026-10-24)

## Context
Banana pancakes with Nutella and mango: the photo finds "pancakes", mango and Nutella, and Tomi
swaps "pancakes" for what he really used (banana, oats, egg, milk). Those pancakes are a recipe
of their own that we eat with different toppings, but they ended up as loose ingredients in every
plate (Tomi's #17).

## Decision
- On the check screen and in Edit meal, **Select** ingredients → **Make it its own dish**: name
  (pre-filled with what the photo called a swapped item, e.g. "Pancakes") and portions made. The
  selection is one plate's worth (one portion; in Edit meal, the recipe's portions) and becomes a
  new meal of ours with its own recipe; the plate keeps that many portions of it.
- `meal_component` (plate meal, component meal, portions in the whole recipe) sits next to
  `meal_ingredient`; a plate may be dishes only. The ingredient picker lists our meals under
  "Ours" (1 portion); "Which ingredient is 'pancakes'?" can be answered with one too.
- **One level deep**: a dish holds no dishes, and a meal that is a dish somewhere can't hold any.
- Nutrition and cost add each dish's values per portion (its own typed-in values count) × portions.
  Stock, the shopping list, "cookable" and Insights → where it comes from go through the dishes'
  ingredients (`meals.bundles.flat_items`). "Used up" can pick a dish's ingredients.
- Dishes are normal meals (in Meals, cookable, plannable, rateable). Ratings of the plate stay on
  the plate; eating the plate doesn't log or count the dish.
- Editing a dish updates the days its plates were eaten. Deleting a dish moves its ingredients into
  the plates (same food, no dish). Deleting a plate keeps its dishes. Undo of a post also removes
  dishes made in that post, unless they were used since (another plate, logged, cooked).

## Aliases (#18)
- What the photo called an item we **swapped** for something else ("pancakes" → banana, oats,
  egg, milk; or → one of our dishes) becomes an alias of the dish (`meal_alias`, 0030). Items the
  model only named differently ("oats" → Rolled oats) don't. The dish's own name is never one.
- Matched in code after the model, not in its prompt (no slower analysis, no model bias):
  `GET /api/analyses/{id}` returns `dishes` for items whose name is an alias (lower case, single
  spaces). The check screen asks "Pancakes — your Healthy banana pancakes? [Yes, swap] [No]".
- No → `POST /api/meals/{id}/aliases/decline`; after 3 in a row the alias isn't offered anymore.
  Swapping it by hand again starts the count from zero. Editable in Edit meal ("Photos call it").

## Alternatives
- Components only inside plates (hidden from Meals): Tomi chose to see them as meals, so they can
  be cooked and eaten on their own.
- Nesting to any depth: more to explain and to compute; no real example yet.

## Consequences
- The recipe writer sees a plate's dishes as "Pancakes (our recipe, N portions)".
- One alias can point at two dishes; the one we said No to least (then the newest) is offered.
