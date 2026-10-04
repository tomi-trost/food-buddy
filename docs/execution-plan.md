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

## M1 — Running on Oracle (needs you for accounts)

- [ ] **You:** create the Oracle Always Free A1 VM (Ubuntu 24.04 arm64, 2 OCPU / 12 GB, 100+ GB boot volume), add an SSH key
- [ ] **You:** Cloudflare Zero Trust → Tunnels → create tunnel `food-buddy`, public hostname `food.<domain>` → `http://caddy:80`; copy the token into `.env`
- [ ] Bootstrap script: Docker, firewall (no ingress besides SSH), `deploy/` checkout, `.env`
- [ ] `docker compose --profile ai --profile tunnel up -d`; pull the model; smoke test from both iPhones (Add to Home Screen)
- [ ] Backups: nightly `pg_dump` + photos with restic; Jetson pulls over SSH; restore drill
- [ ] Optional: Uptime Kuma on the Pi 3

## M2 — Model benchmark (`eval/`)

- [ ] Script running every provider over a Nutrition5k subset + our weighed meals; metrics: ingredient P/R, kcal/macro % error, JSON validity, latency, RAM
- [ ] Compare Qwen3-VL 2B/4B, Qwen2.5-VL 3B, Gemma 4 small, food-analysis LoRA on Oracle
- [ ] Pick default model + prompt; accept 0018

## M3 — Nutrition data

- [ ] Import USDA FoodData Central (Foundation + SR Legacy), Ciqual; aliases; fiber + sugar
- [ ] Open Food Facts barcode lookup endpoint (cached)
- [ ] Matching quality tests on a fixed list of model outputs → expected ingredients

## M4 — Snap loop complete

- [ ] Verdict editing persisted (rename/replace ingredient, add/remove, grams); store corrections
- [ ] Post meal: meal type, servings, prep time, cost, who ate/cooked → `Meal`
- [ ] Recipe + prep time generation task; Web Push "analysis ready" (VAPID)
- [ ] Refresh tokens; rate limit on login
- [ ] Client-side photo resize before upload (saves mobile data); HEIC check on iPhone
- [ ] Capacitor Android build (APK sideload)

## M5+ — Features in mock order

Meals feed & ratings → Ingredients (fridge/pantry) & shopping → Weekly plan generator → Insights & snacks (label scan, barcode, croissants) → Offline write queue, failover drill, README/self-hosting docs, go public (license decision).

## Local development

```
make db         # Postgres in Docker on :5433
make api        # uvicorn with reload on :8000 (runs migrations + seed)
make worker     # Procrastinate worker
make web        # Vite dev server on :5173 (proxies /api)
make test       # api + web tests
```

Without a model running, analysis jobs fail with "no vision provider reachable". Run `make ollama` (or point `VISION_PROVIDERS` at any OpenAI-compatible server) to try real photos.
