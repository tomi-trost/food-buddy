import type { MealCard, MealKind, Origin, Rating, Slider } from '../api/types'

/** "Today" / "Yesterday" / "N days ago" between two YYYY-MM-DD dates. */
export function ago(dateISO: string | null, todayISO: string): string {
  if (!dateISO) return 'Never'
  const days = Math.round((Date.parse(todayISO) - Date.parse(dateISO)) / 86_400_000)
  return days <= 0 ? 'Today' : days === 1 ? 'Yesterday' : `${days} days ago`
}

export const ORIGIN_LABEL: Record<Origin, string> = { home: '🍳 Cooked', bought: '🛒 Bought', out: '🍽️ Ate out' }

export const againLabel = (v: number) => (v >= 5 ? 'yes' : v >= 3 ? 'maybe' : 'no')

/** Words for the 7 slider steps, −3 … +3. */
export const EFFORT_STEPS = ['Not really', 'Hardly', 'Not quite', 'Meh', 'Fairly', 'Mostly', 'Totally'] as const
export const FILL_STEPS = ['Left us hungry', 'Still hungry', 'A bit light', 'Just right', 'A bit heavy', 'Heavy', 'Too heavy'] as const

export const stepLabel = (steps: readonly string[], v: Slider) => steps[v + 3]

/** The "How filling" tip from both people's answers (the average slider). */
export function fillTip(ratings: (Rating | null)[]): string | null {
  const fills = ratings.flatMap((r) => (r && r.fill !== null ? [r.fill] : []))
  if (!fills.length) return null
  const avg = fills.reduce<number>((a, f) => a + f, 0) / fills.length
  if (avg <= -1) return 'Left us hungry. Try +50 g rice/pasta or +100 g lentils/chickpeas for fiber.'
  if (avg >= 1) return 'A bit heavy. Try −50 g carbs or swap part of them for veg.'
  return 'Portion feels right.'
}

export type FeedType = 'all' | MealKind
export type FeedSeg = 'all' | 'top' | 'quick' | 'cheap'
export type FeedSort = 'rating' | 'recent' | 'cooked'

export const SORT_LABEL: Record<FeedSort, string> = { rating: 'Top rated', recent: 'Most recent', cooked: 'Most cooked' }
export const NEXT_SORT: Record<FeedSort, FeedSort> = { rating: 'recent', recent: 'cooked', cooked: 'rating' }

/** Mock filters: Top rated ≥ 4.3, ≤ 30 min, ≤ 4 € per portion. "All" is the meals: snacks have
 *  their own tab (a snack that's also a breakfast shows in both). */
export function feed(cards: MealCard[], type: FeedType, seg: FeedSeg, sort: FeedSort): MealCard[] {
  let list = cards.filter((m) => (type === 'all' ? m.types.some((t) => t !== 'snack') : m.types.includes(type)))
  if (seg === 'quick') list = list.filter((m) => m.prep_minutes <= 30)
  if (seg === 'top') list = list.filter((m) => (m.score ?? 0) >= 4.3)
  if (seg === 'cheap') list = list.filter((m) => m.cost / m.portions <= 4)
  const lastCooked = (m: MealCard) => m.last_cooked ?? m.created_at.slice(0, 10)
  return [...list].sort((a, b) =>
    sort === 'rating'
      ? (b.score ?? 0) - (a.score ?? 0)
      : sort === 'cooked'
        ? b.cooked_count - a.cooked_count
        : lastCooked(b).localeCompare(lastCooked(a)),
  )
}

/** Meals to pick for a slot: name contains the query; ones made for this meal type first,
 *  then the most recently cooked. */
export function pickable(cards: MealCard[], type: MealKind, query: string): MealCard[] {
  const q = query.trim().toLowerCase()
  return cards
    .filter((m) => m.name.toLowerCase().includes(q))
    .sort((a, b) =>
      Number(b.types.includes(type)) - Number(a.types.includes(type)) ||
      (b.last_cooked ?? '').localeCompare(a.last_cooked ?? '') ||
      a.name.localeCompare(b.name))
}
