// "What's new" notes shown once after an update. Every user-facing change adds an entry at the top.

export type Release = { id: string; notes: string[] }

export const RELEASES: Release[] = [
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
