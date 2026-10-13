import type { DayTotals, Goals } from '../api/types'
import { CHALLENGES } from './insights'

export type GoalKey = 'kcal' | 'fiber' | 'protein' | 'sugar'
export type DayStatus = 'hit' | 'miss' | 'empty' | 'future'

/** What "hit" means per goal; days with nothing logged never count either way. */
export const GOALS: Record<GoalKey, { label: string; describe: (g: Goals) => string; ok: (d: DayTotals, g: Goals) => boolean; value: (d: DayTotals) => string }> = {
  kcal: { label: 'kcal', describe: (g) => `Within ±150 kcal of ${g.kcal}`, ok: CHALLENGES.kcal.ok, value: (d) => `${Math.round(d.kcal)} kcal` },
  fiber: { label: 'Fiber', describe: (g) => `At least ${g.fiber} g fiber`, ok: CHALLENGES.fiber.ok, value: (d) => `${Math.round(d.fiber)} g fiber` },
  protein: { label: 'Protein', describe: (g) => `At least ${g.protein} g protein`, ok: CHALLENGES.protein.ok, value: (d) => `${Math.round(d.protein)} g protein` },
  sugar: { label: 'Sugar', describe: (g) => `At most ${g.sugar} g sugar`, ok: (d, g) => d.sugar <= g.sugar, value: (d) => `${Math.round(d.sugar)} g sugar` },
}

const pad = (n: number) => String(n).padStart(2, '0')
export const isoOf = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`

export function dayStatus(day: DayTotals | undefined, goal: GoalKey, goals: Goals, today: string, date: string): DayStatus {
  if (date > today) return 'future'
  if (!day || day.kcal <= 0) return 'empty'
  return GOALS[goal].ok(day, goals) ? 'hit' : 'miss'
}

/** Weeks (Monday first) of the month `m` (0-based); null pads the first and last week. */
export function monthGrid(y: number, m: number): (string | null)[][] {
  const first = (new Date(y, m, 1).getDay() + 6) % 7 // Monday = 0
  const len = new Date(y, m + 1, 0).getDate()
  const cells: (string | null)[] = [...Array(first).fill(null), ...Array.from({ length: len }, (_, i) => isoOf(y, m, i + 1))]
  while (cells.length % 7) cells.push(null)
  return Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7))
}

/** Last day of the month, or today when the month is still running (the API fills days up to `end`). */
export function monthEnd(y: number, m: number, today: string): string {
  const last = isoOf(y, m, new Date(y, m + 1, 0).getDate())
  return last < today ? last : today
}

/** Hit days in a row up to today; today only breaks the streak once it's over, so it counts if already hit. */
export function streak(days: DayTotals[], goal: GoalKey, goals: Goals, today: string): number {
  const past = days.filter((d) => d.date <= today).sort((a, b) => b.date.localeCompare(a.date))
  if (past[0]?.date === today && dayStatus(past[0], goal, goals, today, today) !== 'hit') past.shift()
  let n = 0
  for (const d of past) {
    if (dayStatus(d, goal, goals, today, d.date) !== 'hit') break
    n += 1
  }
  return n
}
