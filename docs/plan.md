# Food Buddy – Views, Navigation & UX Flow (mock phase)

## Context
Two-person (user + girlfriend) phone-first app: photo of plate → AI identifies meal + macros → auto recipe → ratings → best meals feed an auto weekly menu → shopping list → fridge tracking, plus progress analytics. Greenfield (empty `/Users/tomitrost/Projects/food-buddy`). This phase = a **single-file clickable HTML mock** (fake data, no backend) to iterate on UX before choosing a real framework (later candidates: Expo/React Native, Capacitor + Svelte/React, etc.). Style: warm & food-forward, light+dark. Rating: 3 axes per person.

## Navigation
Bottom tab bar (5 tabs) + central camera FAB:

| Tab | Purpose |
|---|---|
| **Home** (Today) | Today's calories/macros ring, "Snap your meal" CTA, tonight's planned meal, fridge "use soon" nudge, latest meal awaiting your rating |
| **Meals** | Feed/gallery of past meals (photo cards), search, filter (rating, time, price, tag), sort. → Meal detail |
| **📷 Snap** (FAB) | Capture flow (modal stack, not a tab) |
| **Plan** | Weekly menu + shopping list (segmented: Menu / Shopping) |
| **Fridge** | Inventory, expiring-soon, manual add/adjust |
| **Insights** | Analytics (reachable also via Home ring tap) |

Tabs shown: Home, Meals, [Snap], Plan, Fridge; Insights is a top-right icon on Home plus a segmented entry in Meals header (keeps bar at 4+FAB). Profile switcher (You / Partner avatar) in top bar of Home; settings (goals, household, dietary prefs, currency) under avatar.

## Screens & flows
1. **Snap flow** (modal): Camera → Analyzing (shimmer) → **Verdict**: detected dish name, photo, ingredient chips with grams, macro summary (kcal, P/C/F, fiber). Tap chip to edit (name/amount/remove), "+ add ingredient" → live macro recalculation. Servings eaten stepper. Confirm →
2. **Post meal** (details sheet): who ate/cooked, **prep time** (stepper/presets), **ingredient cost** (auto estimate, editable) with computed **per-portion price**, portions made, notes. Auto-generated recipe preview (steps + ingredients) editable. Save → meal posted to feed; fridge auto-deducts ingredients (confirmation toast with undo).
3. **Meal detail**: hero photo, title, macros, time/cost/per-portion chips, tabs: Recipe | Nutrition | Ratings. "Cook again" (adds to plan), edit ingredients/recipe.
4. **Rate**: per person, 3 axes — Taste (1–5 stars), "Make again?" (yes/maybe/no), "Worth the effort?" (yes/meh/no) + optional note. Partner's rating shown after you submit (or visible with pending state). Combined score badge on cards.
5. **Weekly plan**: "Plan next week" wizard: (a) available cooking time per day (chips: skip / 15 / 30 / 60+ min, weekend toggle), (b) optional constraints (kcal target, budget, repeats), → generated week grid (7 days × dinner, optional lunch) built from top-rated meals fitting time; swap/lock/reroll per slot; "Approve together" — both tap approve (status: You ✓ / Partner pending). Approved → shopping list generated.
6. **Shopping list**: grouped by aisle, quantities aggregated across recipes, minus fridge stock (shown as "have 200g"), check-off while shopping, add manual item, "Finished shopping" → items move into fridge (with quantity/expiry editable review sheet). Estimated total.
7. **Fridge**: list by category/location, qty, expiry badges, "use soon" sorted; actions: add, +/- qty, mark finished. Suggested "cook with what you have" from past recipes.
8. **Insights**: range selector (Day/Week/Month); calories vs goal line/bars; macro pie/donut; fiber goal hit streak + calendar heat dots; spend & avg time per meal; per-person toggle (You / Partner / Both); top-rated meals.
9. **Settings**: goals (kcal, macros, fiber), household members, units/currency, dark mode.

## Mock implementation plan
- Single file `/Users/tomitrost/Projects/food-buddy/index.html`: inline CSS (design tokens on `:root`, dark-mode via `prefers-color-scheme`) + vanilla JS.
- Hash router (`#/home`, `#/meals/:id`, `#/snap/verdict`, …); screens as `<template>` sections; bottom sheet + modal stack helpers.
- Fake data in one JS `DATA` object (6–8 meals w/ placeholder gradient/emoji "photos", ingredients w/ macros per 100g, fridge items, week plan, 2 users).
- Real interactive logic where it sells the UX: ingredient edit → macro recalculation; rating → score; plan generation by time filter + rating sort; plan → shopping list aggregation minus fridge; finishing shopping → fridge update.
- Desktop: render centered 390×844 phone frame; mobile: full-screen. Inline SVG for donut/line charts (follow `dataviz` skill palette rules).
- Build order: shell+tokens+tabs → Home → Snap flow → Post meal → Meal detail/Rate → Meals feed → Plan/Shopping → Fridge → Insights → polish.

## Verification
- Open `index.html` in Chrome (claude-in-chrome) at 390×844; click through full loop: Snap → edit ingredient (macros change) → post → rate (both users) → Plan wizard (time inputs change the menu) → approve → shopping list → finish shopping → fridge updated → Insights reflects the new meal.
- Check dark mode, no horizontal scroll, tap targets ≥44px, no console errors.
- Then iterate on UX with the user before choosing the implementation stack.
