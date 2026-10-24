// "What's new" notes shown once after an update. Every user-facing change adds an entry at the top.

export type Release = { id: string; notes: string[] }

export const RELEASES: Release[] = [
  {
    id: '2026-10-24-count-in',
    notes: [
      'Tap an ingredient to count it in grams, pieces or ml. Pieces ask once what one weighs, then it shows that way everywhere for both of you.',
      'Amounts in ml show to the ml now, not in steps of 5.',
    ],
  },
  {
    id: '2026-10-24-barcode-ingredient',
    notes: [
      'Cooking with a packaged food, like a tortilla? Tap the barcode button next to ingredient search, scan it, check it once, and it is added with its exact values.',
      'Count it in pieces (one tortilla) or grams. Next time the same barcode adds it straight away, and it also works when adding to your fridge.',
    ],
  },
  {
    id: '2026-10-24-dish-families',
    notes: [
      'Tap "By dish" in Meals: pasta with any sauce shows as one Pasta row, chia with any fruit as Oats & chia.',
      'Wrong family? Change it in Edit meal, or leave it empty and we guess from the name.',
      'Chicken or fish with vegetables is a "Protein & veg plates" family. Make your own family: from two meals on, new ones like them land there by themselves.',
    ],
  },
  {
    id: '2026-10-24-insights',
    notes: [
      'Insights goes back in time: use the arrows or swipe the calories chart right for the week (or day, or month) before.',
      'Fiber and sugar sit next to protein, carbs and fat, and "Where it comes from" shows the foods you eat most for each.',
      'See how many breakfasts, lunches, dinners and snacks you had.',
    ],
  },
  {
    id: '2026-10-24-meals-screen',
    notes: [
      'Meals has a calmer look: a switch for the meal type, small filters (tap again to clear) and the sort on the same row.',
      'Meal types everywhere have icons, and Recipe, Nutrition and Ratings too.',
      'Wrong emoji? Change it in Edit meal. No photo yet? Tap "Add photo" on the meal.',
    ],
  },
  {
    id: '2026-10-24-bought-ate-out',
    notes: [
      'Bought it or ate out? Pick Bought or Ate out when you check a photo: it counts for today without a recipe, rating or a spot in your meals.',
      'Add the place and price if you like. Insights shows how often you ate out each week or month.',
      'Liked it? Open it from Today and tap "Save to our meals".',
    ],
  },
  {
    id: '2026-10-24-rating-sliders',
    notes: [
      'Worth the effort and How filling are sliders now, from "not really" to "totally" with meh in the middle.',
      'The stars on a meal are its average taste.',
      'Snacks only ask how they tasted and if you\'d have them again.',
    ],
  },
  {
    id: '2026-10-24-discard-amounts',
    notes: [
      'Changed your mind about a photo? Tap ✕ on the banner or the bin at the top, while it\'s analyzing or after. Undo brings it back.',
      'Type any amount, down to 1 g or ml (0.1 of a piece). The − and + buttons still step as before.',
      'The Snacks card on Home just counts now: snacks you add are in it already.',
    ],
  },
  {
    id: '2026-10-15-steps-editor',
    notes: ['Recipe steps in Edit meal are easier to read: each step grows to fit its text, with move and remove buttons grouped above it.'],
  },
  {
    id: '2026-10-15-search-sheet',
    notes: [
      'Ingredient search stays in view above the keyboard, so you can see what you type.',
      'Swiping down while typing now just hides the keyboard; swipe again to close.',
    ],
  },
  {
    id: '2026-10-14-snacks-are-meals',
    notes: [
      'Snacks are meals now: a home-made chia pudding gets its ingredients, portions and ratings like any meal. Pick "Snack" when you add food.',
      'Our snacks live under Meals → Snacks. Scanned or label products saved there show their pack values, and come out of what\'s at home when you have one.',
      'Your saved snacks moved over by themselves.',
    ],
  },
  {
    id: '2026-10-14-snack-units',
    notes: [
      'Snacks now come in the right unit: a chia pudding in grams, a Coca-Cola in ml, cookies in pieces.',
      'Switch it on the snack screen with "Count in" (grams, ml or pieces). Scanned drinks remember ml.',
    ],
  },
  {
    id: '2026-10-14-icon',
    notes: [
      'New app icon: a table for two. iPhone keeps the old one until you remove Food Buddy from the Home Screen and add it again from Safari (your data stays).',
    ],
  },
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
