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
**First: fix CI.** The push of M1 to `main` (run 37239904499) failed one web test: `web/src/pages/PlanPage.test.tsx` → "approving as the last person opens the shopping list" (line ~87: Shopping list tab expected `aria-pressed="true"`). Passes locally; most likely a timing issue on the slower CI runner (the assertion runs right after the toast appears, before the tab switch has rendered). Fix: wrap that assertion in `waitFor`/`findByRole`, then re-run CI. The app itself is fine (backend job and the other 81 web tests passed).

M1 (mock parity) is done on `feat/mock-parity`. Next is M2, deployment to Oracle: needs the user for the Oracle VM and the Cloudflare tunnel token. Then M3 (model benchmark) and M4 (USDA/Ciqual import). Parked questions: license, subdomain, confirming 0017. Vision models must be **instruct** tags (e.g. `qwen3-vl:4b-instruct`); the plain `qwen3-vl:2b` thinks and returns empty content. After rebuilding the web image locally, clear the PWA service worker in the browser (it serves the old bundle until reload).

## Testing (required)
- Every feature or bug fix ships with tests in the same change: backend in `api/tests/` (pytest), web in `web/src/**/*.test.ts(x)` (Vitest + Testing Library).
- Cover the behaviour, not just the happy path: validation errors, auth/permission checks, and edge cases (empty lists, zero grams, missing provider, etc.).
- External services (vision model, Open Food Facts, push) are faked in tests (e.g. `httpx.MockTransport`); tests never call the network.
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
- Navigation: tabs Home / Meals / [Snap FAB] / Plan / Ingredients (Fridge + Pantry sections); Insights + Settings via Home header.
- Ratings: 3 axes per person — Taste (1–5), Make again (yes/maybe/no), Worth the effort (yes/meh/no).
