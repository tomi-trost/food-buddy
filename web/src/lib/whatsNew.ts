// "What's new" notes shown once after an update. Every user-facing change adds an entry at the top.

export type Release = { id: string; notes: string[] }

export const RELEASES: Release[] = [
  {
    id: '2026-10-14-access-loop',
    notes: [
      "Fixed the endless reloading after entering Cloudflare's e-mail code: the code now sticks and the app opens normally.",
      'Without a connection the app stays open with what was last loaded instead of jumping to the login page.',
    ],
  },
  {
    id: '2026-10-13-snack-pieces',
    notes: [
      'Scanned snacks can be counted in pieces (3 cookies instead of 27 g). The app remembers it for next time.',
      'A photo stuck on "analyzing" after an app update now restarts by itself within a few minutes.',
    ],
  },
  {
    id: '2026-10-13-undo-steps',
    notes: [
      'Posted by mistake? The meal page offers Undo for 10 minutes: ingredients, shopping list and the photo go back.',
      'Edit meal → Steps: change, reorder, add or remove recipe steps.',
    ],
  },
  {
    id: '2026-10-13-units',
    notes: ['Eggs, fruit, bread slices and the like are counted in pieces, and drinks, milk and oils in ml, instead of grams.'],
  },
  {
    id: '2026-10-13-photo-resize',
    notes: ['Photos are shrunk on the phone before uploading, so sending one is much quicker.'],
  },
  {
    id: '2026-10-13-typed-amounts',
    notes: ['Tap the number between − and + to type an exact value (grams, portions, cost, goals…).'],
  },
  {
    id: '2026-10-13-portion-priors',
    notes: [
      'Photo estimates learn from your corrections: when you keep changing an amount (e.g. rice), the AI is told your usual portion.',
    ],
  },
  {
    id: '2026-10-13-goal-push',
    notes: [
      "New notification around 6:30 pm when fiber or protein is still short, with what's at home that helps. Turn it off in Settings → Notifications.",
    ],
  },
  {
    id: '2026-10-13-goal-calendar',
    notes: [
      'Insights → Calendar: see the days you hit your kcal, fiber, protein or sugar goal, with your streak.',
      'Insights → Overview: new Month range (last 30 days).',
      'After an update, a short note like this one tells you what changed.',
    ],
  },
]

const SEEN_KEY = 'fb.whatsNew'

export function seenRelease(): string | null {
  try {
    return localStorage.getItem(SEEN_KEY)
  } catch {
    return null
  }
}

export function markSeen(id: string) {
  try {
    localStorage.setItem(SEEN_KEY, id)
  } catch {
    /* storage blocked: the note shows again next time */
  }
}

/** Releases newer than the last one seen, newest first; only the latest when nothing (known) was seen. */
export function unseen(releases: Release[], seen: string | null, max = 3): Release[] {
  const i = releases.findIndex((r) => r.id === seen)
  if (i === 0) return []
  return releases.slice(0, i > 0 ? Math.min(i, max) : 1)
}
