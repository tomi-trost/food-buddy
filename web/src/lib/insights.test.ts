import { describe, expect, it } from 'vitest'
import type { DayTotals, MemberInsights } from '../api/types'
import { avg, challengeProgress, macroSplit, versus } from './insights'

const day = (over: Partial<DayTotals>): DayTotals => ({
  date: '2026-10-04', kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, treats: 0, treat_sugar: 0, ...over,
})
const member = (days: Partial<DayTotals>[], over: Partial<MemberInsights> = {}): MemberInsights => ({
  user_id: 1, name: 'Tomi', color: '#000', goals: { kcal: 2000, protein: 100, fiber: 30, sugar: 50 },
  meals_rated: 0, days: days.map(day), ...over,
})

describe('insights math', () => {
  it('averages only logged days', () => {
    const days = [day({ kcal: 2000, fiber: 30 }), day({}), day({ kcal: 1000, fiber: 10 })]
    expect(avg(days, 'kcal')).toBe(1500)
    expect(avg(days, 'fiber')).toBe(20)
    expect(avg([day({})], 'kcal')).toBe(0)
  })

  it('splits energy by macro', () => {
    const split = macroSplit([day({ kcal: 1, protein: 25, carbs: 50, fat: 100 / 9 })])!
    expect(split.protein).toBeCloseTo(25)
    expect(split.carbs).toBeCloseTo(50)
    expect(split.fat).toBeCloseTo(25)
    expect(macroSplit([day({})])).toBeNull()
  })

  it('scores versus categories against each person\'s own goals', () => {
    const a = member([{ kcal: 2050, fiber: 31, protein: 120 }, { kcal: 1950, fiber: 35, protein: 110 }], { meals_rated: 4 })
    const b = member([{ kcal: 1500, fiber: 20, protein: 90 }], { user_id: 2, name: 'P', meals_rated: 4, goals: { kcal: 1800, protein: 80, fiber: 25, sugar: 40 } })
    const { rows, points } = versus(a, b)
    expect(rows.map((r) => r.winner)).toEqual(['a', 'a', 'a', 'a', null])
    expect(rows[3]).toMatchObject({ a: '±0 kcal', b: '±300 kcal' })
    expect(points).toEqual({ a: 4, b: 0 })
  })

  it('a person with nothing logged loses calorie accuracy', () => {
    const { rows } = versus(member([{}]), member([{ kcal: 3000 }]))
    expect(rows[3]).toMatchObject({ a: '–', winner: 'b' })
  })

  it('counts challenge days', () => {
    const m = member([{ kcal: 2100, fiber: 30 }, { kcal: 2300, fiber: 10 }, {}])
    expect(challengeProgress(m, 'fiber')).toBe(1)
    expect(challengeProgress(m, 'kcal')).toBe(1)
  })
})
