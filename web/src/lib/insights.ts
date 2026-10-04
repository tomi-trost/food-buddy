import type { DayTotals, Goals, MemberInsights } from '../api/types'

/** Days with anything logged; averages ignore empty days so a forgotten day doesn't drag them down. */
export const logged = (days: DayTotals[]) => days.filter((d) => d.kcal > 0)

export function avg(days: DayTotals[], key: keyof DayTotals): number {
  const xs = logged(days)
  return xs.length ? xs.reduce((a, d) => a + (d[key] as number), 0) / xs.length : 0
}

/** Share of energy from protein (4 kcal/g), carbs (4) and fat (9), in %. */
export function macroSplit(days: DayTotals[]): { protein: number; carbs: number; fat: number } | null {
  const p = avg(days, 'protein') * 4
  const c = avg(days, 'carbs') * 4
  const f = avg(days, 'fat') * 9
  const t = p + c + f
  if (!t) return null
  return { protein: (p / t) * 100, carbs: (c / t) * 100, fat: (f / t) * 100 }
}

export const fiberHit = (d: DayTotals, goals: Goals) => d.fiber >= goals.fiber

export type Challenge = 'fiber' | 'protein' | 'kcal'
export const CHALLENGE_TARGET = 5

export const CHALLENGES: Record<Challenge, { name: string; describe: (g: Goals) => string; ok: (d: DayTotals, g: Goals) => boolean }> = {
  fiber: { name: 'Fiber race', describe: (g) => `Hit ${g.fiber} g fiber on 5 days`, ok: (d, g) => d.fiber >= g.fiber },
  protein: { name: 'Protein push', describe: (g) => `Hit ${g.protein} g protein on 5 days`, ok: (d, g) => d.protein >= g.protein },
  kcal: { name: 'On target', describe: () => 'Land within ±150 kcal of your goal on 5 days', ok: (d, g) => d.kcal > 0 && Math.abs(d.kcal - g.kcal) <= 150 },
}

export const challengeProgress = (m: MemberInsights, c: Challenge) =>
  m.days.filter((d) => CHALLENGES[c].ok(d, m.goals)).length

type Category = { label: string; value: (m: MemberInsights) => number; format: (v: number) => string; higherWins: boolean }

/** The mock's Versus categories (each measured against that person's own goals). */
export const CATEGORIES: Category[] = [
  { label: 'Fiber goal days', value: (m) => m.days.filter((d) => fiberHit(d, m.goals)).length, format: (v) => `${v} / 7`, higherWins: true },
  { label: 'Avg fiber', value: (m) => avg(m.days, 'fiber'), format: (v) => `${Math.round(v)} g`, higherWins: true },
  { label: 'Avg protein', value: (m) => avg(m.days, 'protein'), format: (v) => `${Math.round(v)} g`, higherWins: true },
  { label: 'Calorie accuracy', value: (m) => (logged(m.days).length ? Math.abs(avg(m.days, 'kcal') - m.goals.kcal) : Infinity), format: (v) => (Number.isFinite(v) ? `±${Math.round(v)} kcal` : '–'), higherWins: false },
  { label: 'Meals rated', value: (m) => m.meals_rated, format: (v) => String(v), higherWins: true },
]

export type VersusRow = { label: string; a: string; b: string; winner: 'a' | 'b' | null }

export function versus(a: MemberInsights, b: MemberInsights): { rows: VersusRow[]; points: { a: number; b: number } } {
  const points = { a: 0, b: 0 }
  const rows = CATEGORIES.map((c) => {
    const va = c.value(a)
    const vb = c.value(b)
    const winner = va === vb ? null : (c.higherWins ? va > vb : va < vb) ? 'a' : 'b'
    if (winner) points[winner] += 1
    return { label: c.label, a: c.format(va), b: c.format(vb), winner } as VersusRow
  })
  return { rows, points }
}
