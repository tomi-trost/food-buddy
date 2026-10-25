import type { MealCard, MealKind, Nutrients, Origin, Rating, Slider } from '../api/types'
import { NUTRIENT_KEYS, ZERO } from './macros'

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

export type Family = { family: string; meals: MealCard[]; best: number | null; top: MealCard[]; avg: Nutrients } // top: collage, avg: per portion

const COLLAGE = 3

/** The family's best-rated dishes for its collage: taste, then score, then most cooked. */
function bestRated(meals: MealCard[]): MealCard[] {
  const rank = (m: MealCard) => [m.taste ?? -1, m.score ?? -1, m.cooked_count]
  return [...meals].sort((a, b) => {
    const [x, y] = [rank(a), rank(b)]
    return y[0] - x[0] || y[1] - x[1] || y[2] - x[2]
  }).slice(0, COLLAGE)
}

/** Meals by dish family, biggest family first ("Other" last); the feed's order inside. */
export function byFamily(cards: MealCard[]): Family[] {
  const groups = new Map<string, MealCard[]>()
  for (const c of cards) groups.set(c.family, [...(groups.get(c.family) ?? []), c])
  return [...groups].map(([family, meals]) => ({
    family,
    meals,
    best: meals.reduce<number | null>((b, m) => (m.taste !== null && (b === null || m.taste > b) ? m.taste : b), null),
    top: bestRated(meals),
    avg: averagePortion(meals),
  })).sort((a, b) => Number(a.family === 'Other') - Number(b.family === 'Other') || b.meals.length - a.meals.length || a.family.localeCompare(b.family))
}

/** The family's average portion: each dish counts once, however often we made it. */
export function averagePortion(meals: MealCard[]): Nutrients {
  const out = { ...ZERO }
  if (!meals.length) return out
  for (const m of meals) for (const k of NUTRIENT_KEYS) out[k] += m.per_portion[k] / meals.length
  return out
}

export type SplitPart = { key: 'protein' | 'carbs' | 'fat'; grams: number; pct: number }

/** Where a portion's energy comes from (4 kcal per g protein and carbs, 9 per g fat), in whole
 *  percent adding up to 100; [] when there's nothing to split. */
export function energySplit(n: Nutrients): SplitPart[] {
  const kcal = { protein: n.protein * 4, carbs: n.carbs * 4, fat: n.fat * 9 }
  const total = kcal.protein + kcal.carbs + kcal.fat
  if (total <= 0) return []
  const keys = ['protein', 'carbs', 'fat'] as const
  const raw = keys.map((k) => (kcal[k] / total) * 100)
  const pct = raw.map(Math.floor)
  // largest remainders get the leftover points, so the bar and labels add up to 100
  const order = raw.map((r, i) => [r - pct[i], i]).sort((a, b) => b[0] - a[0])
  for (let left = 100 - pct.reduce((a, b) => a + b, 0), j = 0; left > 0; left--, j++) pct[order[j][1]]++
  return keys.map((key, i) => ({ key, grams: n[key], pct: pct[i] }))
}
