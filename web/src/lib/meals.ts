import type { Fill, MealCard, MealType, Rating } from '../api/types'

/** "Today" / "Yesterday" / "N days ago" between two YYYY-MM-DD dates. */
export function ago(dateISO: string | null, todayISO: string): string {
  if (!dateISO) return 'Never'
  const days = Math.round((Date.parse(todayISO) - Date.parse(dateISO)) / 86_400_000)
  return days <= 0 ? 'Today' : days === 1 ? 'Yesterday' : `${days} days ago`
}

export const againLabel = (v: number) => (v >= 5 ? 'yes' : v >= 3 ? 'maybe' : 'no')

export const FILL_LABEL: Record<Fill, string> = { hungry: 'left us hungry', right: 'just right', heavy: 'too heavy' }

/** The mock's "How filling" tip from both people's answers. */
export function fillTip(ratings: (Rating | null)[]): string | null {
  const fills = ratings.flatMap((r) => (r ? [r.fill] : []))
  if (!fills.length) return null
  const hungry = fills.filter((f) => f === 'hungry').length
  const heavy = fills.filter((f) => f === 'heavy').length
  if (hungry > heavy) return 'Left us hungry. Try +50 g rice/pasta or +100 g lentils/chickpeas for fiber.'
  if (heavy > hungry) return 'A bit heavy. Try −50 g carbs or swap part of them for veg.'
  return 'Portion feels right.'
}

export const scoreOf = (r: Rating) => (r.taste + r.again + r.effort) / 3

export type FeedType = 'all' | MealType
export type FeedSeg = 'all' | 'top' | 'quick' | 'cheap'
export type FeedSort = 'rating' | 'recent' | 'cooked'

export const SORT_LABEL: Record<FeedSort, string> = { rating: 'Top rated', recent: 'Most recent', cooked: 'Most cooked' }
export const NEXT_SORT: Record<FeedSort, FeedSort> = { rating: 'recent', recent: 'cooked', cooked: 'rating' }

/** Mock filters: Top rated ≥ 4.3, ≤ 30 min, ≤ 4 € per portion. */
export function feed(cards: MealCard[], type: FeedType, seg: FeedSeg, sort: FeedSort): MealCard[] {
  let list = cards.filter((m) => type === 'all' || m.types.includes(type))
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
