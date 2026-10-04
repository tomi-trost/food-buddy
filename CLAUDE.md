# Food Buddy

Phone-first app for two people (Tomi + partner): snap a plate photo → AI identifies the meal and macros (correctable) → auto recipe, prep time, price → both rate it → best-rated meals feed an auto-generated weekly menu (given available cooking time) → approved menu produces a shopping list → fridge inventory tracked from meals cooked and groceries bought → analytics (calories, fiber goal, macro split).

## Current phase
**Design mock.** `index.html` is a single-file clickable prototype (vanilla JS + CSS, fake data, hash routing, phone frame on desktop). Goal: iterate UX until it feels natural, then write an implementation plan and pick a real stack (must support web + native, e.g. Expo/React Native or Capacitor). Do not add build tooling to the mock.

## Structure
- `index.html` — the mock (state `S`, data `ING`/`meals`, screen functions, `A` action map, click delegation via `data-act`/`data-a`)
- `docs/decisions/` — one file per decision (ADR-lite), numbered `NNNN-title.md`
- `docs/ideas.md` — backlog of ideas / open questions
- `docs/changelog.md` — dated log of what changed in the mock and why
- Original plan: `docs/plan.md`

## Next session
Design plan is in `docs/design-plan.md` (zero cost + open source; React/Vite PWA + Capacitor; FastAPI + Postgres + worker; Docker Compose with Pi 5 app host, Jetson GPU inference, Oracle off-site standby, Cloudflare Tunnel; self-hosted Qwen3-VL + USDA/Ciqual/OFF grounding). Next: answer its open questions (§9: which Jetson, Pi specs, license), then phase 0 spikes. Confirm 0017/0018 afterwards.

## Working agreements (keep logs current)
- When the user makes a design/tech decision → add `docs/decisions/NNNN-title.md` (Context, Decision, Alternatives, Consequences) and link it in `docs/decisions/README.md`.
- When the user floats an idea or open question → append to `docs/ideas.md` (status: idea / planned / done / dropped).
- After each meaningful mock iteration → add a dated entry to `docs/changelog.md`.
- Remote: `origin` = `git@github.com:tomi-trost/food-buddy.git`.

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
