# Food Buddy — Execution plan

Date: 2026-10-04 · Companion to `docs/design-plan.md` (the *what/why*); this file is the *order of work*. Tick items as they land.

Rule for every milestone: each feature ships with tests (see CLAUDE.md → Testing), CI green, changelog entry.

## M0 — Walking skeleton (done 2026-10-04, branch `feat/walking-skeleton`)

The thinnest end-to-end slice through every layer, so later work only adds features and never "connects" things.

Photo in the PWA → FastAPI saves it → job queued in Postgres → worker asks the vision model (OpenAI-compatible) → ingredients matched to the nutrition table → macros → PWA shows the result with editable grams.

- [x] Repo layout: `api/`, `web/`, `deploy/`, `.github/workflows/`, root `Makefile`
- [x] API: settings, async SQLAlchemy + Alembic (initial migration incl. `pg_trgm` and the Procrastinate schema), `/api/health`
- [x] Auth: register (create household or join with invite code), login, `me`; argon2 + JWT access token
- [x] Nutrition: `Ingredient` table, macro math, fuzzy matching (aliases → trigram similarity), seed from the mock's ingredient list
- [x] Vision: OpenAI-compatible provider + provider chain with fallback, strict JSON schema, faked in tests
- [x] Analysis: photo upload (resize to ≤1280 px JPEG), `AnalysisJob`, Procrastinate task, result with per-item macros + totals
- [x] Web: React + Vite + TS PWA shell with the mock's tokens, login/register, snap upload, analysis page (polling, editable grams, live totals)
- [x] Deploy: Dockerfiles (api, web+Caddy), `compose.yaml` (db, api, worker, caddy, ollama `ai`, cloudflared `tunnel`), `compose.dev.yaml`, `.env.example`
- [x] CI: ruff + pytest with Postgres service; web typecheck + Vitest + build; arm64 image build to GHCR (manual trigger). Workflows not run on GitHub yet (nothing pushed)
- [x] Verified locally: full Docker stack + real photo through Qwen3-VL 2B instruct (Ollama on the Mac): upload → queue → worker → matching → macros in the PWA

Learned in M0 (feeds M2/M3): plain `qwen3-vl` tags are thinking models → use `-instruct`; the 2B model badly underestimates portions (50 g of spaghetti on a full plate); the 23-item seed list misses common items (peas, ground meat).

## M1 — Mock parity (in progress, branch `feat/mock-parity`)

Decided 2026-10-04: build the whole app up to the mock first, deploy afterwards. Work goes in **sections**. Each section is a vertical slice (API + screens + tests), ends green, and gets one local commit. Nothing is pushed or merged without asking.

Shared conventions for all sections:
- "Today" is the phone's local date. The client sends `YYYY-MM-DD` and the server never guesses time zones.
- Everything is scoped to the household. A partner's data is visible (ratings, Versus), never another household's.
- Meal photos come from the snap; meals without one show the mock's gradient + emoji.
- One `FoodLog` table holds everything eaten (meals and snacks). Daily totals, Home and Insights all read from it.

### S1 — App shell, design system, profile & settings
- [x] Ingredient fields from the mock: emoji, category, price per 100 g, shelf days (seed updated)
- [x] User goals (kcal, protein, fiber, sugar) + avatar colour; household reward settings (treat-free days per croissant, weekly cap); `PATCH /api/me`, `PATCH /api/household`; members listed in `/api/me`
- [x] Web: tab bar + Snap FAB, line-icon set from the mock, bottom sheet, toast (with undo), stepper, half-star rating, segmented/underline/mini toggles, macro tiles; Home header (date, greeting, Insights, avatar → Settings)
- [x] Settings sheet: goals, croissant settings, dark mode, accent colour (per device), invite code, log out

### S2 — Snap → meal
- [x] Ingredient search API (`GET /api/ingredients?q=`) for add/replace; multi-word model phrases also suggest single-word matches ("ground meat" → Beef mince)
- [x] Verdict: tap chip → grams/remove/replace sheet, resolve unmatched items, add ingredient, portions eaten, live macros
- [x] Meal details: meal type, prep time, cost (auto from ingredient prices), portions made, used-up ingredients, auto recipe preview
- [x] `POST /api/meals` from an analysis → `Meal` + ingredients + `CookLog` + `FoodLog` (portion share) + stock deduction + used-up → shopping list; corrections stored
- [x] Recipe steps: template right away, replaced by a model-generated recipe in the background
- [x] Snap can start with a meal type (`/snap?type=lunch`); the Home "+" buttons arrive with S6

### S3 — Meals & ratings
- [ ] Feed: meal-type filter, Any/Top rated/≤30 min/≤4 €, sort (top rated / most recent / most cooked), cards with rating, cost per portion, cooked N×
- [ ] Detail: photo, chips, stats (cooked, last cooked, avg rating), Recipe / Nutrition (per portion + "how filling" tip) / Ratings tabs
- [ ] Rating sheet: taste (half stars), make again, worth the effort, how filling; partner's rating + "waiting for partner"; combined score
- [ ] "I cooked this again": meal type, used-up ingredients → cook log, food log, stock

### S4 — Ingredients (fridge & pantry)
- [ ] Inventory API: list by location, add (+default amount), ±50 g, expiry from shelf days
- [ ] Minus to zero → "used it up" (→ shopping list) / "just remove" / keep
- [ ] "Cook with what you have" suggestions; "Use soon" data for Home

### S5 — Plan & shopping
- [ ] Wizard grid (7 days × breakfast/lunch/dinner; cook 15/30/45/60+, prep, out, skip) and deterministic generator from ratings + time + variety
- [ ] Week view: summary (cook/prep/out/skip, grocery cost), batch-cook note, kcal per day, slot sheet (mode + meal picker), add-to-plan from a meal
- [ ] Approve together (both users; any change resets approval)
- [ ] Shopping list: needs minus stock, rounded, grouped by category, ran-out items, check-off, est. total, "finished shopping" → inventory

### S6 — Home & Insights
- [ ] Home: kcal ring + macro bars (animated), today by meal type with "+", snacks card, planned today / plan CTA, rate-this-meal, use soon
- [ ] Insights Overview: calories vs goal (day/week), macro split donut, fiber goal days, avg cost / cook time, top rated
- [ ] Versus: per-category winners, score, weekly challenge (fiber / protein / on target)

### S7 — Snacks & croissant rewards
- [ ] Log a snack: pick from list, photo (vision model, snack schema), nutrition-label scan (vision model → per-100 g values, editable); kind sweet/savory/drink
- [ ] Treat sugar vs goal, treat-free days, croissant passes (earn, cap, use)
- [ ] Insights → Snacks tab: sugar chart, rewards, today, "who resists better"

## M2 — Running on Oracle (after M1; needs you for accounts)

- [ ] **You:** create the Oracle Always Free A1 VM (Ubuntu 24.04 arm64, 2 OCPU / 12 GB, 100+ GB boot volume), add an SSH key
- [ ] **You:** Cloudflare Zero Trust → Tunnels → create tunnel `food-buddy`, public hostname `food.<domain>` → `http://caddy:80`; copy the token into `.env`
- [ ] Bootstrap script: Docker, firewall (no ingress besides SSH), `deploy/` checkout, `.env`
- [ ] `docker compose --profile ai --profile tunnel up -d`; pull the model; smoke test from both iPhones (Add to Home Screen)
- [ ] Backups: nightly `pg_dump` + photos with restic; Jetson pulls over SSH; restore drill
- [ ] Optional: Uptime Kuma on the Pi 3

## M3 — Model benchmark (`eval/`)

- [ ] Script running every provider over a Nutrition5k subset + our weighed meals; metrics: ingredient P/R, kcal/macro % error, JSON validity, latency, RAM
- [ ] Compare Qwen3-VL 2B/4B, Qwen2.5-VL 3B, Gemma 4 small, food-analysis LoRA on Oracle
- [ ] Pick default model + prompt; accept 0018

## M4 — Nutrition data

- [ ] Import USDA FoodData Central (Foundation + SR Legacy), Ciqual; aliases; fiber + sugar
- [ ] Open Food Facts barcode lookup endpoint (cached)
- [ ] Matching quality tests on a fixed list of model outputs → expected ingredients

## M5 — Hardening & extras

- [ ] Web Push (VAPID): "analysis ready", "partner rated", "approve the plan"
- [ ] Refresh tokens; rate limit on login
- [ ] Client-side photo resize before upload (saves mobile data); HEIC check on iPhone
- [ ] API types generated from OpenAPI
- [ ] Capacitor Android build (APK sideload)
- [ ] Offline write queue, failover drill, README/self-hosting docs, go public (license decision)

## Local development

```
make db         # Postgres in Docker on :5433
make api        # uvicorn with reload on :8000 (runs migrations + seed)
make worker     # Procrastinate worker
make web        # Vite dev server on :5173 (proxies /api)
make test       # api + web tests
```

Without a model running, analysis jobs fail with "no vision provider reachable". Run `make ollama` (or point `VISION_PROVIDERS` at any OpenAI-compatible server) to try real photos.
