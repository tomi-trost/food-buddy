# 0027 — Bought and eaten-out food is logged, not added to our meals

**Status:** accepted (2026-10-24)

## Context
Every photo or typed food ended in the meal flow: recipe, prep time, cost per portion, a
rating and a place in Meals. A sandwich from the shop or a restaurant dinner isn't something
we cooked, and it cluttered the library and the weekly menu.

## Decision
- The details step asks **Where's it from?** Cooked / Bought / Ate out (two separate options,
  so eating out can be counted on its own).
- Bought / Ate out keep only what matters for nutrition: name, meal type, ingredients and
  portions eaten, plus an optional shop/restaurant and price paid.
- Stored as a meal with `origin` bought|out and `listed = false`: one portion, `cost` = price
  paid, no steps, no stock taken (not even when logged again), no recipe job, no "rate it" push.
  Food-log entries, editing and the Today list work as for any meal.
- Hidden from Meals, the plan and "cook with what you have" until **Save to our meals**
  (`PATCH listed: true`); then it can be rated and logged again, still marked Bought / Ate out.
- Insights (week / month) shows "Ate out N× · bought N×" and the total paid.

## Alternatives
- A food-log entry without a meal: would need its own edit, nutrition and "save later" paths.
- One "Not cooked" option: rejected by Tomi; eating out is worth counting separately.

## Consequences
- "You too?" suggestions still go out for bought / eaten-out food (we often eat out together).
- Price is per plate; portions eaten scale the total in Insights.
