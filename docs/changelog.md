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
- "Photo of snack" button renamed "Photo". First commit pushed; next session: tech stack, deployment and serving decisions.

## 2026-10-04 (planning)
- Design plan for the real app (`docs/design-plan.md`): Expo client, FastAPI + Postgres + worker, one Docker Compose stack for Oracle Always Free and the Raspberry Pi, open food-analysis model research and pipeline, phased roadmap.
- Decisions 0015 (FastAPI) and 0016 (Docker on both hosts) accepted; 0017 (Expo) and 0018 (self-hosted VLM + nutrition DB) proposed pending the phase-0 spike.
- Plan v2 after answers: both iPhones and no fees → web-first PWA + Capacitor (0017 revised from Expo); Pi 5 app host + Jetson (if Orin Nano) GPU inference + Oracle off-site standby, exposed via Cloudflare Tunnel (0016); zero cost + open source (0019).
- Plan v3: hardware is a Pi 3 B (1 GB) and an original Jetson Nano (GPU unusable for LLMs), both on SD → Oracle Always Free becomes primary with CPU inference; Jetson = home backup/standby; Pi 3 = optional monitor (0016 revised).

## 2026-10-04 (M0 walking skeleton)
- `api/`: FastAPI with household auth (create or join with invite code, argon2 + JWT), `Ingredient` table seeded from the mock, macro math, fuzzy ingredient matching (pg_trgm), vision provider chain over any OpenAI-compatible API, photo upload → Procrastinate job → worker → grounded result. 49 pytest tests against real Postgres.
- `web/`: React + Vite PWA with the mock's tokens: login/register/join, snap upload, analysis page (polling, editable grams, live totals). 12 Vitest tests.
- `deploy/`: Docker images (api; web built into Caddy), compose stack with `ai` (Ollama) and `tunnel` (cloudflared) profiles; CI workflows (tests, arm64 images to GHCR).
- Verified end to end in Docker with a real photo and Qwen3-VL 2B (Ollama on the Mac). Findings: the plain `qwen3-vl:2b` tag is a thinking model that returns empty JSON, so instruct tags are now the default; the worker didn't register all ORM tables (fixed, regression test); matching no longer accepts single shared words ("mystery sauce" ≠ "soy sauce"); portion estimates from the 2B model are far too low (→ M2 benchmark).

## 2026-10-05 (M1 mock parity)
- The real app now covers every mock screen, built in seven tested sections on `feat/mock-parity`: S1 shell/design system/settings, S2 snap → meal with editable verdict, S3 meals feed/detail/ratings/cook again, S4 fridge & pantry, S5 weekly plan/approvals/shopping list, S6 Home & Insights (overview, versus), S7 snacks, label scan and croissant passes.
- 125 API tests (pytest, real Postgres) and 82 web tests (Vitest); every section checked in the Docker stack.
- Findings that changed the code: ingredient search also suggests single-word matches for model phrases ("ground meat" → Beef mince); recipes are written by the model in the background (template first); label scans ask for the amount the printed values refer to (a per-200 g label was misread as per-100 g, and a %-daily-value figure as sugar, before this fix); dark-mode carbs colour darkened to pass the chart palette check; decorative thumbnails hidden from screen readers.
- Not in the mock but needed by the planner: a meal edit sheet (meal types, prep-friendly).

