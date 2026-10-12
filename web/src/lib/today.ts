import type { LogEntry, MealType } from '../api/types'

const TYPES: MealType[] = ['breakfast', 'lunch', 'dinner']
// Where an empty meal row sits in the day (minutes after midnight)
const USUAL: Record<MealType, number> = { breakfast: 8 * 60, lunch: 12 * 60 + 30, dinner: 19 * 60 }

export type TodayRow =
  | { kind: 'meal'; mealType: MealType; entries: LogEntry[] }
  | { kind: 'snack'; entry: LogEntry; time: string }

const minutes = (iso: string) => {
  const d = new Date(iso)
  return d.getHours() * 60 + d.getMinutes()
}

export const clock = (iso: string) => {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Breakfast, lunch and dinner in that order, with each snack placed after the meal before it. */
export function todayRows(entries: LogEntry[]): TodayRow[] {
  const anchors: number[] = []
  TYPES.forEach((t, i) => {
    const logged = entries.filter((e) => e.meal_type === t).map((e) => minutes(e.logged_at))
    const at = logged.length ? Math.min(...logged) : USUAL[t]
    anchors.push(i ? Math.max(at, anchors[i - 1]) : at) // a late-logged breakfast stays before lunch
  })
  const snacks = entries
    .filter((e) => e.meal_type === 'snack')
    .map((e) => ({ e, at: minutes(e.logged_at) }))
    .sort((a, b) => a.at - b.at)
  // slot 0 = before breakfast, slot i = after meal i-1
  const slotOf = (at: number) => anchors.filter((a) => a <= at).length
  const snackRows = (slot: number): TodayRow[] =>
    snacks.filter((s) => slotOf(s.at) === slot).map((s) => ({ kind: 'snack', entry: s.e, time: clock(s.e.logged_at) }))

  return [
    ...snackRows(0),
    ...TYPES.flatMap((t, i): TodayRow[] => [
      { kind: 'meal', mealType: t, entries: entries.filter((e) => e.meal_type === t) },
      ...snackRows(i + 1),
    ]),
  ]
}
