import { describe, expect, it } from 'vitest'
import type { LogEntry } from '../api/types'
import { isTreat, snackNutrients, treatSugarToday } from './snacks'

const n = (kcal: number, sugar: number) => ({ kcal, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar })
const entry = (over: Partial<LogEntry>): LogEntry => ({
  id: 1, meal_type: 'snack', name: 'x', emoji: '', kind: 'snack', snack_kind: 'sweet', is_reward: false, meal_id: null, nutrients: n(100, 10), ...over,
})

describe('snacks', () => {
  it('scales pieces and grams', () => {
    expect(snackNutrients({ per: 'piece', amount: 1.5, per_unit: n(140, 10) }).kcal).toBe(210)
    expect(snackNutrients({ per: '100g', amount: 45, per_unit: n(450, 26) }).sugar).toBeCloseTo(11.7)
  })

  it('treats are sweets and drinks but not rewards or savory snacks', () => {
    expect(isTreat(entry({}))).toBe(true)
    expect(isTreat(entry({ snack_kind: 'drink' }))).toBe(true)
    expect(isTreat(entry({ snack_kind: 'savory' }))).toBe(false)
    expect(isTreat(entry({ is_reward: true }))).toBe(false)
    expect(isTreat(entry({ kind: 'meal', snack_kind: null }))).toBe(false)
  })

  it('sums today\'s snacks and treat sugar', () => {
    const today = [entry({}), entry({ snack_kind: 'savory', nutrients: n(200, 1) }), entry({ kind: 'meal', snack_kind: null })]
    expect(treatSugarToday(today)).toEqual({ snacks: 2, sugar: 10 })
  })
})
