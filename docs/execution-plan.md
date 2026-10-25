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

## M1 — Mock parity (done 2026-10-05, branch `feat/mock-parity`)

Decided 2026-10-04: build the whole app up to the mock first, deploy afterwards. Work goes in **sections**. Each section is a vertical slice (API + screens + tests), ends green, and gets one local commit. Nothing is pushed or merged without asking.

Result: every screen of the mock works against the real API (S1–S7, one commit each). Verified in the Docker stack with Qwen3-VL 2B on the Mac (meal photo → verdict → post → model recipe; nutrition label → per-100 g values).

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
- [x] Feed: meal-type filter, Any/Top rated/≤30 min/≤4 €, sort (top rated / most recent / most cooked), cards with rating, cost per portion, cooked N×
- [x] Detail: photo, chips, stats (cooked, last cooked, avg rating), Recipe / Nutrition (per portion + "how filling" tip) / Ratings tabs
- [x] Rating sheet: taste (half stars), make again, worth the effort, how filling; partner's rating + "waiting for partner"; combined score
- [x] "I cooked this again": meal type, used-up ingredients → cook log, food log, stock

### S4 — Ingredients (fridge & pantry)
- [x] Inventory API: list by location, add (+default amount), ±50 g, expiry from shelf days
- [x] Minus to zero → "used it up" (→ shopping list) / "just remove" / keep
- [x] "Cook with what you have" suggestions; "Use soon" data for Home

### S5 — Plan & shopping
- [x] Wizard grid (7 days × breakfast/lunch/dinner; cook 15/30/45/60+, prep, out, skip; this/next week) and deterministic generator from ratings + time + variety
- [x] Meal edit sheet: meal types and prep-friendly flag (planner inputs)
- [x] Week view: summary (cook/prep/out/skip, grocery cost), batch-cook note, kcal per day, slot sheet (mode + meal picker), add-to-plan from a meal
- [x] Approve together (both users; any change resets approval)
- [x] Shopping list: needs minus stock, rounded, grouped by category, ran-out items, check-off, est. total, "finished shopping" → inventory

### S6 — Home & Insights
- [x] Home: kcal ring + macro bars (animated), today by meal type with "+", planned today / plan CTA, rate-this-meal, use soon (snacks card comes with S7)
- [x] Insights Overview: calories vs goal (day/week), macro split donut, fiber goal days, avg cost / cook time, top rated
- [x] Versus: per-category winners, score, weekly challenge (fiber / protein / on target)

### S7 — Snacks & croissant rewards
- [x] Log a snack: pick from list, photo (vision model, snack schema), nutrition-label scan (vision model reads values + the amount they refer to → normalised per 100 g); kind sweet/savory/drink; editable amount
- [x] Treat sugar vs goal, treat-free days, croissant passes (earn, cap, use)
- [x] Insights → Snacks tab: sugar chart, rewards, today, "who resists better"

## M2 — Running on Oracle (after M1; needs you for accounts)

- [x] **You:** create the Oracle Always Free A1 VM (Ubuntu 24.04 arm64, 2 OCPU / 12 GB, 100+ GB boot volume), add an SSH key. Done 2026-10-11 after upgrading to Pay As You Go (free-tier capacity never came); quota policy `free-tier-guard` caps everything at the Always Free limits, budget alerts at 0.01 actual / 1 forecast
- [x] **You:** Cloudflare Zero Trust → Tunnels → create tunnel `food-buddy`, public hostname `food-buddy.web-corner.cc` → `http://caddy:80`; token in `.env` on the VM. Cloudflare Access (one-time PIN, only our two emails, 1-month session) in front of the whole hostname
- [x] Bootstrap script `deploy/bootstrap.sh`: Docker, swap, 25 Mbit/s egress cap (stays under the free 10 TB/month), checkout in `/opt/food-buddy`, `.env` with generated secrets. Oracle's host firewall already accepts only SSH
- [ ] `docker compose --profile ai --profile tunnel up -d`; pull the model; smoke test from both iPhones (Add to Home Screen)
- [x] Continuous deploy: CI `deploy` job (after api + web pass on main) SSHes to the VM with a deploy-only key forced to `deploy/deploy.sh` (pull, build on the VM, `up -d`, health check). Needs the key in `authorized_keys`, `DEPLOY_SSH_KEY` + `DEPLOY_KNOWN_HOSTS` secrets, `DEPLOY_HOST` variable, `production` environment
- [x] Backups: nightly `pg_dump` + photos with restic → Backblaze B2 bucket `food-buddy-backups` (0020, `deploy/backup.sh`, systemd timer ~03:30 UTC). Private bucket, "Keep only the last version", Caps & Alerts at $0, bucket-only app key in `/etc/food-buddy/backup.env`; restic password in Tomi's Passwords app. First backup + `restore-test` passed 2026-10-12. Later: Jetson pulls a second copy
- [ ] Optional: Uptime Kuma on the Pi 3

## M2b — After the first days of real use (2026-10-12)

- [x] Login fix (2026-10-13 also a "Trouble signing in?" link on the login page to `/api/reauth`): an expired Cloudflare Access session made every API call fail with "Load failed" (the service worker's cached shell never passed Access again); the client now detects Access' redirect and goes through `/api/reauth`, which Access intercepts with its PIN page and then sends back
- [x] Log an existing meal: Today's "+" opens a picker (snap or one of our meals, slot's type first); meal cards have a log button; the cook sheet has portions eaten and "cooked it now" vs "already made" (leftovers / partner cooked: no second stock deduction, source `leftover`)
- [x] Saved snacks: "Save to our snacks" when logging a snack (photo kept), "Our snacks" in the snack sheet, Meals → Snacks tab; one per name per household, edit/remove (`saved_snack`, 0013)
- [x] Snacks in the right unit (2026-10-14): grams, ml or pieces from the model, labels per 100 ml, barcodes in ml for drinks, "Count in" switch
- [x] Snacks are meals (2026-10-14, decision 0025): home-made snacks with ingredients, portions, ratings and "You too?"; products as one-ingredient meals with their pack values; saved snacks migrated (0022), never in the weekly plan
- [x] Type it instead: meals and snacks from a typed name (`POST /api/analyses/text`), same job, check screen and push; text prompts with portion anchors (0014). ~4 s on the Mac vs ~1 min expected on the VM (no image encoding)
- [x] Add food sheet instead of the black camera page: the center tab button is now "+" and opens one sheet with every way in (photo first, library, type it, our meals, snack, label scan) and the meal type on top; Today's "+" opens it with its slot's type; old `/snap` links open it
- [x] "You too?": a meal one of us logs is suggested to the other (Home card + `shared` push); accepting logs it without touching stock (`meal_suggestion`, 0015)
- [x] Bundles (2026-10-24, decision 0029, #17): Select ingredients → "Make it its own dish" on the check screen or in Edit meal; our meals under "Ours" in the ingredient picker; `meal_component` (0029), one level deep; stock/shopping/insights through the dishes' ingredients
- [x] Aliases (2026-10-24, #18): what the photo called an item we swapped becomes an alias of the dish (`meal_alias`, 0030); the check screen asks "Pancakes — your …?" (matched in code after the model); 3 No's in a row stop it; editable in Edit meal

## M3 — Model benchmark (`eval/`)

- [x] Script running every provider over a Nutrition5k subset + our weighed meals; metrics: ingredient P/R, kcal/macro % error, JSON validity, latency, RAM (`api/benchmark/`, `eval/README.md`, 2026-10-12)
- [x] First comparison 2026-10-12 (`eval/results/2026-10-12.md`): Qwen3-VL 2B/4B, Qwen2.5-VL 3B on 40 Nutrition5k plates + 2 of ours. **Kept `qwen3-vl:4b-instruct` + prompt v1** (kcal error 26%, ~184 s per photo on the VM). Gemma 3 4B didn't download; no Gemma 4 / food LoRA on Ollama yet
- [ ] **Second comparison once ~20–30 household plates are weighed and labelled** (weigh before posting): re-check 4B v1 vs v2 (portion hints, removes the +24% bias but worse protein/fat), add Gemma; pick the prompt from our own food
- [ ] Accept 0018 after the second comparison

## M4 — Nutrition data

- [x] Curated catalog of ~250 common foods from USDA SR Legacy + Ciqual with aliases, fiber + sugar; unmatched names logged (2026-10-12, decision 0021)
- [x] Import the rest of USDA SR Legacy and Ciqual (~9,950 rows), searchable; matched only by exact generated short names, hand-picked rows first (2026-10-13, decision 0022). Foundation Foods left out (mostly repeats SR Legacy)
- [x] Open Food Facts barcode lookup endpoint `GET /api/barcode/{code}`, cached 30 days (unknown: 1 day), stale answer when OFF is down (2026-10-13). Scanner in the app (snacks) and remembered products 2026-10-13, decision 0023
- [x] Matching quality tests: all 236 names from the 2026-10-12 benchmark → expected ingredient or none (`api/tests/test_matching_quality.py`; 222 match, 14 generic/non-food stay unmatched)

## M5 — Hardening & extras

- [x] Web Push (VAPID): built 2026-10-12 (moved up from M5) with "ready to check", "rate after eating" (90 min), "partner rated", daily reminder (18:00 UTC); per-kind switches in Settings; own `notifier` worker on the `push` queue. "Weekly menu" (`plan`) added 2026-10-13: new menu → the other one approves, first approval → your turn, both → shopping list ready
- [ ] Refresh tokens; rate limit on login
- [ ] Client-side photo resize before upload (saves mobile data); HEIC check on iPhone
- [ ] API types generated from OpenAPI
- [ ] Capacitor Android build (APK sideload)
- [x] Offline write queue (2026-10-25, decision 0030)
- [ ] Failover drill, README/self-hosting docs, go public (license decision)

## Local development

```
make db         # Postgres in Docker on :5433
make api        # uvicorn with reload on :8000 (runs migrations + seed)
make worker     # Procrastinate worker
make web        # Vite dev server on :5173 (proxies /api)
make test       # api + web tests
```

Without a model running, analysis jobs fail with "no vision provider reachable". Run `make ollama` (or point `VISION_PROVIDERS` at any OpenAI-compatible server) to try real photos.
