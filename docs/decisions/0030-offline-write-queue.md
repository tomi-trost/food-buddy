# 0030 — Offline write queue: everyday changes wait on the phone

**Status:** accepted (2026-10-25)

## Context
In a shop or a restaurant the phone often has no signal. Until now every change failed with
"Can't reach Food Buddy" and had to be redone later, so ticks on the shopping list or a logged
lunch got lost (next-up #7).

## Decision
- The everyday changes go through `queueable` in `api/client.ts`: photo and typed meals,
  logging a meal or snack (`/meals/{id}/cook`, `/snacks`), ratings (meal and photo), editing or
  removing a food-log entry, shopping list ticks and fridge/pantry changes.
- Offline (the phone says so or the last call couldn't reach the server), or when the request
  fails before reaching the server, the change is stored in IndexedDB (`lib/outbox.ts`; photos as
  bytes plus their form fields, already resized) and the call throws `Queued`. Screens treat that
  like success: sheets close with "No connection: saved on this phone…", shopping ticks and stock
  amounts change at once (optimistic), and the red error line ignores it (`shownError`).
- While older changes wait, new ones queue behind them, so they reach the server in the order they
  were made (a tick then an untick stays unticked).
- `OfflineBanner` counts what waits and sends it (`flushOutbox`) when the connection is back,
  then every 30 s while anything waits. Sent → all data refetched and one toast. A change the
  server turns down (4xx other than 401: the meal is gone, invalid) is dropped and named in the
  toast. Network failure, 401 and 5xx stop the flush and keep everything for later.
- Not queued: posting a checked photo, editing or deleting meals, the plan, settings. They need
  answers from the server (ids, recalculated values) or are rare enough to redo; they still show
  "Can't reach Food Buddy".

## Alternatives
- Background Sync in the service worker: not in Safari/iOS, which both of us use.
- Queueing every write generically: most screens use the server's answer (new ids, recalculated
  meals), so they'd need fake answers; the chosen set covers what happens away from Wi-Fi.
- Persisting the React Query cache for a cold start offline: separate change, not done yet
  (the app shell opens offline, but data shows only once loaded in that session).

## Consequences
- A request that reached the server but whose answer got lost is kept and sent again: a rare
  double log, fixable in Today. Server endpoints aren't idempotent yet.
- Dates are in the body (`eaten_on`), so a lunch sent in the evening still counts for lunch;
  the real eating time (for the fullness idea) would need the time in the body too.
- Tests use `fake-indexeddb`; `test/setup.ts` empties the outbox after each test.
