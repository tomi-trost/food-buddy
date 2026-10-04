# Mock changelog

## 2026-10-04
- Initial single-file mock `index.html`: Home, Meals feed + detail (recipe/nutrition/ratings), Snap flow (camera → analyzing → verdict with editable ingredients → details/price/time → post), per-person rating sheet, Plan wizard + generated week + two-person approval, shopping list (minus fridge) → fridge, Fridge, Insights, Settings.
- Added CLAUDE.md, decision log, ideas backlog, git repo.

## 2026-10-04 (iteration 2)
- Half-star taste rating (see 0008).
- Meal types: log breakfast/lunch/dinner, Home groups today's log by type, Meals feed filters by type (0005).
- Plan is now a 7×3 grid with cook / meal prep / eating out / skip per slot; batch-cook summary; per-slot swap sheet (0005).
- Partner Versus tab with scoreboard and weekly challenge (0008).
- Calmer palette, smaller radii, unified line-icon set; emoji kept only for ingredients (0006).
- "Used up an ingredient" while cooking → fridge removal + shopping list entry (0007).

## 2026-10-04 (iteration 3)
- Plan wizard made compact (fits without scrolling); plan summary spacing fixed, € icon above the number without the duplicate sign.
- Accent colour switcher in Settings (Terracotta, Olive, Teal, Indigo, Plum, Mustard, Charcoal) for live comparison (0006).
- Meal detail: cooked-count / last cooked / avg rating stats; "Add to plan" is now a labelled button opening a day × meal-type slot picker; € shown after the number, no icon.
- Meals feed shows "Cooked N×" and can sort by times cooked.
- Rating gets a 4th signal "How filling was it?" with a tip card on the Nutrition tab (0009).
- Macro identity: icon + colour per kcal/protein/carbs/fat/fiber/sugar, used on Home, nutrition and snap verdict (0010).
- Sugar tracking and a separate Sweets story: log sweets from Home, Insights → Sweets tab with goal line and partner comparison (0011).

## 2026-10-04 (iteration 4)
- Analytics icon changed to a pie-chart glyph.
- Home macro bars: label + value on top, identity icon sits in front of the bar on its own line, more row spacing.
- Fat colour changed from blue to muted violet (blue looked like water).
- Meals: compact icon filter (All / Breakfast / Lunch / Dinner), sort is now an outlined button showing the active sort.
- Insights hierarchy: Overview / Versus / Sweets are underlined primary tabs; You/Partner and Day/Week are small secondary toggles.

## 2026-10-04 (iteration 5)
- Home macro legend compacted again: name starts at the bar's left edge, grams in a smaller font, icon in front of the bar.
- Croissant reward system for treat-free days (0012): Home sweets card, Insights → Sweets rewards card, settings for days-per-croissant and weekly cap.
- Fridge tab renamed Ingredients with Fridge/Pantry sections and canned/dry goods (0013); minus-to-zero asks "Have you used it up?".

## 2026-10-04 (iteration 6)
- Sweets became Snacks (0014): kinds Sweet/Savory/Drink, macros tracked, treats feed the streak and croissant rewards.
- Log a snack by photo (auto-detect) or by scanning the nutrition label on the pack, or pick from a list.
- Home progress ring and bars animate from empty (with kcal count-up) every time you navigate to Home; skipped when the OS asks for reduced motion.
- "Photo of snack" button renamed "Photo only". First commit pushed; next session: tech stack, deployment and serving decisions.
