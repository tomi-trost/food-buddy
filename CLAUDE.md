# Food Buddy

Phone-first app for two people (Tomi + partner): snap a plate photo → AI identifies the meal and macros (correctable) → auto recipe, prep time, price → both rate it → best-rated meals feed an auto-generated weekly menu (given available cooking time) → approved menu produces a shopping list → fridge inventory tracked from meals cooked and groceries bought → analytics (calories, fiber goal, macro split).

## Current phase
**Implementation: M1 mock parity done** (see `docs/execution-plan.md`). The mock `index.html` stays as the UX reference (single file, vanilla JS + CSS; do not add build tooling to it). Real app: `web/` (React + Vite PWA) → `api/` (FastAPI) → Postgres + Procrastinate worker → vision model (Ollama, OpenAI-compatible) → nutrition grounding. Plan and rationale: `docs/design-plan.md`.

## Structure
- `api/` — FastAPI app (`app/<feature>/` packages: auth, nutrition, vision, analysis, meals, ratings, inventory, plan, shopping, logs, snacks), Alembic migrations, pytest suite in `api/tests/` (needs Postgres on :5433 → `make db`)
- `web/` — React + Vite + TS PWA (`src/pages` screens, `src/{snap,meals,plan,snacks}` feature parts, `src/ui` design system, `src/lib` pure logic, `src/api` client + types), Vitest tests next to the code
- `deploy/` — `compose.yaml` (db, api, worker, caddy, ollama `ai`, cloudflared `tunnel`), `compose.dev.yaml`, `.env.example`
- `Makefile` — `make db | api | worker | web | test | lint | stack`
- `index.html` — the mock (state `S`, data `ING`/`meals`, screen functions, `A` action map, click delegation via `data-act`/`data-a`)
- `docs/decisions/` — one file per decision (ADR-lite), numbered `NNNN-title.md`
- `docs/ideas.md` — backlog of ideas / open questions
- `docs/changelog.md` — dated log of what changed in the mock and why
- `docs/design-plan.md` (stack, hosting, model research) · `docs/execution-plan.md` (milestones, checkboxes) · original mock plan: `docs/plan.md`

## Next session
M2 is mostly done (2026-10-11): the stack runs on the Oracle A1 VM `food-buddy` (138.3.250.82, `ssh ubuntu@138.3.250.82`, stack in `/opt/food-buddy/deploy`) and is live at **https://food-buddy.web-corner.cc** behind Cloudflare Access (one-time PIN, only Tomi's and partner's emails). Oracle is Pay As You Go, kept at 0 € by quota policy `free-tier-guard` + a budget alert; never create resources beyond the Always Free limits.

**Deploys:** every push to `main` goes live automatically once CI passes (CI `deploy` job → `deploy/deploy.sh` on the VM via a deploy-only key). Manual SSH: `ssh food-buddy` (Mac `~/.ssh/config` entry with `UseKeychain yes`; the key's passphrase is in the macOS Keychain, so no `ssh-add` needed).

**Smoke test (done 2026-10-12):** snap, library, camera, zoom, partner registration with the invite code and Add to Home Screen all work on the iPhone.

**Cloudflare Access + service worker (learned 2026-10-13):** when the Access session expires, every request (also `/sw.js`, so app updates) gets a 302 to Access' PIN page, and the cached app shell never passes Access again. The app now detects that and navigates to `/api/reauth` (outside the service worker), and the login page links to it ("Trouble signing in?"). Phones stuck on a pre-fix bundle: open `https://food-buddy.web-corner.cc/api/reauth?next=/` in Safari (Home Screen app: delete and re-add). The session expired after ~1 day twice; on 2026-10-13 Tomi set the app's and the policy's session duration (the global session timeout only covers the team login). Waiting to see whether daily re-logins stop.

**After first use (2026-10-12, `docs/execution-plan.md` → M2b):** login fix for expired Cloudflare Access sessions (`/api/reauth`); log an existing meal from Today's "+" or a meal card (portions, "cooked now" vs "already made" = no second stock deduction); saved snacks (Meals → Snacks); the center "+" opens an Add food sheet (`web/src/add/`) that replaced the camera page; "Type it" (`POST /api/analyses/text`, same check screen); "You too?" suggestions of the other one's logged meals (Home card + `shared` push).

**Analysis speed (measured 2026-10-12, pasta photo, qwen3-vl:4b-instruct on 2 cores):** 1280 px → 234 s (1,328 prompt tokens); 896 px → 202 s; 768 px → 202 s (both 1,164 tokens: Ollama scales small images up to ~1,030 image tokens). Same answer at all sizes. `vision_max_px` = 896 (model copy only; stored photo stays 1280). Remaining time ≈ 140 s image encoding + 65 s for ~250 output tokens. Smaller models checked 2026-10-12 (3 real photos: pasta, overnight oats, biscotti label): `qwen3-vl:2b-instruct` ~40% faster and read the label exactly, but invented ingredients (garlic, butter, "spoon") with a flat 0.95 confidence; `qwen2.5vl:3b` slower and missed chia, called biscotti savory; `gemma3:4b` mixed up label columns (kcal 169 = kJ per biscuit). **Kept `qwen3-vl:4b-instruct`** (best meal answers, label right via the per-biscuit column). Other speedups: shorter answer schema, llama.cpp `--image-max-tokens`. **Ingredients:** 23 mock rows + ~260 hand-picked USDA/Ciqual rows (decision 0021; add foods in `api/scripts/{usda,ciqual}_catalog.txt`, rebuild with `scripts/build_catalog.py`) + the rest of SR Legacy and Ciqual (~9,950 rows, `full_foods.csv.gz`, decision 0022: searchable, matched only by exact generated short names; rebuild with `build_catalog.py full` after changing the hand-picked lists). All loaded on API start. Matching is pinned by `tests/test_matching_quality.py` (236 benchmark names). Barcode: `GET /api/barcode/{code}` (Open Food Facts, cached) + scanner in Log a snack / Add food (`web/src/snacks/BarcodeScanner.tsx`, zxing-wasm self-hosted, decision 0023; live camera, else photo of the barcode or typed number). Logged scans are remembered per household (`household_product`: name, type, values, amount) and win over Open Food Facts on the next scan; unknown products can be typed in once. What's missing: `docker compose exec api python -m app.nutrition.unmatched` on the VM.

**Background analysis (2026-10-12):** photos stay open (`analysis_job.closed_at`) until posted/logged/discarded; banner above the tabs (`web/src/layout/PendingBanner.tsx`, logic in `lib/pending.ts`) for both of us; rate while waiting (`analysis_rating`, moved onto the meal on post). **Web Push** (`api/app/push/`, `web/public/push-sw.js`, Settings → Notifications): ready to check, rate after eating (90 min), partner rated, "you too?", weekly menu to approve / approved (2026-10-13), evening reminder (18:00 UTC), goals not hit yet (16:30 UTC). Needs `VAPID_PRIVATE_KEY` + `VAPID_SUBJECT` in `deploy/.env` (`python -m app.push.keys`); iPhone only in the Home Screen app.

**Meal edits (2026-10-12):** posted meals are fully editable on `/meals/:id/edit` (ingredients, portions, cost, nutrition per portion override `meal.nutrients_override`) and deletable (optionally keeping the food-log entries); food-log entries store `servings`, so edits update the days a meal was eaten (stock stays as it was). Sheets close with a swipe down and lock the page behind (`ui/Sheet.tsx`). Home's Today list shows snacks between the meals by time (`lib/today.ts`); tapping an entry changes portions/amount (snacks: values too) or removes it (`PATCH/DELETE /api/log/{id}`, own entries only; snacks keep `per` + `per_unit`).

**Backups (live 2026-10-12):** nightly restic → Backblaze B2 (`deploy/backup.sh`, decision 0020), timer ~03:30 UTC; logs: `sudo journalctl -u food-buddy-backup`. Restore drill: `sudo /opt/food-buddy/deploy/backup.sh restore-test`. The restic password is in Tomi's Passwords app; without it the backups are unreadable.

Then: M3's second comparison when enough of our plates are weighed. Family members later: add their emails to the Access policy; they can register their own household. Parked questions: license, subdomain, confirming 0017. Vision models must be **instruct** tags (e.g. `qwen3-vl:4b-instruct`); the plain `qwen3-vl:2b` thinks and returns empty content. **App updates (2026-10-13):** the service worker is in `prompt` mode; an open app checks for a new version every 30 min and on each return to the foreground, then shows a "New version available · Reload" popup (`web/src/layout/UpdatePrompt.tsx`, `lib/swUpdate.ts`). Phones still on a bundle from before this change get it once after fully closing and reopening the app.

**Goal calendar (2026-10-13):** Insights → Calendar (`web/src/insights/GoalCalendar.tsx`, logic `lib/goalCalendar.ts`): month grid of days each goal was hit (kcal ±150 like "On target", fiber/protein ≥ goal, sugar ≤ goal; empty days count neither way) + current streak. Overview has a Month range (last 30 days). Goals aren't stored per day, so past days use today's goals. "What's new" note after each update: `web/src/lib/whatsNew.ts`.

**Units (2026-10-13):** amounts are stored in grams everywhere; hand-picked ingredients can be shown/typed as pieces/slices/cloves or ml (`api/app/nutrition/units.py`: grams per piece or density, exposed as `unit` + `unit_grams`; web `lib/units.ts`). Add a food there to count it.

**Order of work (set by Tomi 2026-10-13); after this we're done for a while:**
1. ~~Evening push when a goal isn't hit yet~~ done 2026-10-13: `goal_reminder` (16:30 UTC, kind `goal`), fiber/protein still short + up to 3 rich items at home for the bigger gap; skipped on days with nothing logged; kcal left out on purpose
2. ~~Household portion priors~~ done 2026-10-13: `app/analysis/priors.py` compares the model's grams with what we posted (per plate) over the last 40 posted analyses; an ingredient seen ≥2× with a median correction >15% goes into the photo/typed prompt as "usual portions" (max 8)
3. ~~Client-side photo resize; HEIC~~ done 2026-10-13: `web/src/lib/photoResize.ts` (1280 px JPEG before upload, original as fallback) + server reads HEIC (`pillow-heif`); still to confirm on the iPhone (camera + library photo)
4. Undo after posting a meal + edit a meal's recipe steps
5. Plan: variety (no same breakfast all week) and who cooks each meal — **both optional** (off unless chosen); also choose meal-prep day
6. Sensible default buy quantities per ingredient (instead of 250 g)
7. Offline write queue

Deferred (not now): M3 second comparison, refresh tokens + login rate limit, OpenAPI types, Capacitor APK, failover drill, self-hosting docs, going public, Uptime Kuma, and the other ideas in `docs/ideas.md`.

## Testing (required)
- Every feature or bug fix ships with tests in the same change: backend in `api/tests/` (pytest), web in `web/src/**/*.test.ts(x)` (Vitest + Testing Library).
- Cover the behaviour, not just the happy path: validation errors, auth/permission checks, and edge cases (empty lists, zero grams, missing provider, etc.).
- External services (vision model, Open Food Facts, push) are faked in tests (e.g. `httpx.MockTransport`); tests never call the network.
- Every user-facing change adds a short entry at the top of `RELEASES` in `web/src/lib/whatsNew.ts` (new `id`, 1–3 plain-language notes); the app shows it once after updating.
- Run the full suite before saying a feature is done and report the result; don't commit with failing tests. A bug fix starts with a test that reproduces it.

## Git rules
- Commit only when the user asks.
- **Always ask before any merge or push to the remote** (including creating/merging PRs). Never push or merge on your own, and an earlier approval doesn't cover later pushes/merges.
- Commit message format: `[type]: Description` — type is a lowercase verb such as `add`, `change`, `remove`, `fix`, `refactor`, `docs`. Example: `[add]: Half-star taste rating`. Keep the description short, imperative and specific.
- End commit messages with the attribution line required by the Claude Code session, if any.
- Don't commit secrets or `.env` files.

## Style / UX conventions
- Warm, food-forward look; one accent color; light + dark via CSS tokens on `:root`.
- Mobile first: 390×844 target, tap targets ≥44px, no horizontal scroll.
- Navigation: tabs Home / Meals / [+ Add food] / Plan / Ingredients (Fridge + Pantry sections); Insights + Settings via Home header.
- Ratings: 3 axes per person — Taste (1–5), Make again (yes/maybe/no), Worth the effort (yes/meh/no).
