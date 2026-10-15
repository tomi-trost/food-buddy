import { describe, expect, it } from 'vitest'
import type { LogEntry } from '../api/types'
import { amountHint, amountStep, amountUnit, crossedValues, isTreat, isTreatKind, perLabel, snackNutrients, switchPer, treatSugarToday } from './snacks'
import { logEntry } from '../test/fixtures'

const n = (kcal: number, sugar: number) => ({ kcal, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar })
const entry = (over: Partial<LogEntry>): LogEntry => ({
  ...logEntry({ meal_type: 'snack', name: 'x', emoji: '', kind: 'snack', snack_kind: 'sweet', meal_id: null, nutrients: n(100, 10) }), ...over,
})

describe('snacks', () => {
  it('scales pieces and grams', () => {
    expect(snackNutrients({ per: 'piece', amount: 1.5, per_unit: n(140, 10) }).kcal).toBe(210)
    expect(snackNutrients({ per: '100g', amount: 45, per_unit: n(450, 26) }).sugar).toBeCloseTo(11.7)
  })

  it('scales ml like grams and names the units', () => {
    expect(snackNutrients({ per: '100ml', amount: 330, per_unit: n(42, 10.6) }).sugar).toBeCloseTo(34.98)
    expect([perLabel('piece'), perLabel('100g'), perLabel('100ml')]).toEqual(['piece', '100 g', '100 ml'])
    expect([amountUnit('piece', 1), amountUnit('piece', 2), amountUnit('100g', 5), amountUnit('100ml', 5)]).toEqual([' piece', ' pieces', ' g', ' ml'])
  })

  it('counts portions like pieces', () => {
    expect(snackNutrients({ per: 'portion', amount: 1.5, per_unit: n(250, 12) }).kcal).toBe(375)
    expect([perLabel('portion'), amountUnit('portion', 1), amountUnit('portion', 2), amountStep('portion')]).toEqual(['portion', ' portion', ' portions', 0.5])
    expect(amountHint('portion')).toBe('how many portions')
  })

  it('switches grams and ml without touching the numbers', () => {
    const pudding = { per: '100g' as const, amount: 200, per_unit: n(160, 8) }
    expect(switchPer(pudding, '100ml', null)).toEqual({ snack: { ...pudding, per: '100ml' }, crossed: null })
    expect(switchPer(pudding, '100g', null).snack).toBe(pudding)
  })

  it('weighs a counted snack through one portion\'s weight, keeping what was eaten', () => {
    const jar = { per: 'piece' as const, amount: 2, per_unit: n(250, 12) } // the model said "2 pieces"
    const { snack, crossed } = switchPer(jar, '100g', null)
    expect(crossed).toEqual({ from: 'piece', perUnit: n(250, 12), pieceG: 100 })
    expect(snack).toEqual({ per: '100g', amount: 200, per_unit: n(250, 12) }) // 100 g a piece to start
    expect(snackNutrients(snack).kcal).toBe(500)

    const heavier = { ...crossed!, pieceG: 250 } // one jar weighs 250 g
    expect(crossedValues(heavier, '100g').kcal).toBe(100)
    expect(crossedValues(heavier, '100g').sugar).toBeCloseTo(4.8)

    const back = switchPer({ ...snack, per_unit: crossedValues(heavier, '100g'), amount: 500 }, 'piece', heavier)
    expect(back).toEqual({ snack: { per: 'piece', amount: 2, per_unit: n(250, 12) }, crossed: null }) // the model's values again
  })

  it('counts a weighed snack in pieces, the whole amount as one piece', () => {
    const { snack, crossed } = switchPer({ per: '100ml', amount: 330, per_unit: n(42, 10.6) }, 'piece', null)
    expect(snack.amount).toBe(1)
    expect(snack.per_unit.kcal).toBeCloseTo(138.6)
    expect(crossed!.pieceG).toBe(330)
  })

  it('treats are sweets and drinks but not rewards, fruit or savory snacks', () => {
    expect(isTreat(entry({ snack_kind: 'fruit' }))).toBe(false)
    expect([isTreatKind('sweet'), isTreatKind('drink'), isTreatKind('fruit'), isTreatKind('savory'), isTreatKind(null)]).toEqual([true, true, false, false, false])
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
