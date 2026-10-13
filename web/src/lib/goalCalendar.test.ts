import { describe, expect, it } from 'vitest'
import type { DayTotals } from '../api/types'
import { dayStatus, monthEnd, monthGrid, streak } from './goalCalendar'

const goals = { kcal: 2000, protein: 100, fiber: 30, sugar: 50 }
const day = (date: string, over: Partial<DayTotals> = {}): DayTotals => ({
  date, kcal: 2000, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, treats: 0, treat_sugar: 0, ...over,
})

describe('goal calendar', () => {
  it('rates a day per goal and ignores empty and future days', () => {
    const d = day('2026-10-05', { kcal: 2140, fiber: 30, protein: 99, sugar: 50 })
    expect(dayStatus(d, 'kcal', goals, '2026-10-13', d.date)).toBe('hit') // within ±150
    expect(dayStatus({ ...d, kcal: 2151 }, 'kcal', goals, '2026-10-13', d.date)).toBe('miss')
    expect(dayStatus(d, 'fiber', goals, '2026-10-13', d.date)).toBe('hit')
    expect(dayStatus(d, 'protein', goals, '2026-10-13', d.date)).toBe('miss')
    expect(dayStatus(d, 'sugar', goals, '2026-10-13', d.date)).toBe('hit')
    expect(dayStatus({ ...d, sugar: 51 }, 'sugar', goals, '2026-10-13', d.date)).toBe('miss')
    // nothing logged: not a sugar "hit" and not a fiber "miss"
    expect(dayStatus(day(d.date, { kcal: 0 }), 'sugar', goals, '2026-10-13', d.date)).toBe('empty')
    expect(dayStatus(undefined, 'fiber', goals, '2026-10-13', d.date)).toBe('empty')
    expect(dayStatus(undefined, 'fiber', goals, '2026-10-13', '2026-10-14')).toBe('future')
  })

  it('lays the month out in Monday-first weeks', () => {
    const weeks = monthGrid(2026, 9) // October 2026 starts on a Thursday
    expect(weeks[0]).toEqual([null, null, null, '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'])
    expect(weeks.at(-1)).toEqual(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', null])
    expect(weeks.every((w) => w.length === 7)).toBe(true)
    expect(monthGrid(2027, 1).flat().filter(Boolean)).toHaveLength(28) // February
  })

  it('ends the month at today while it is still running', () => {
    expect(monthEnd(2026, 9, '2026-10-13')).toBe('2026-10-13')
    expect(monthEnd(2026, 8, '2026-10-13')).toBe('2026-09-30')
    expect(monthEnd(2025, 11, '2026-10-13')).toBe('2025-12-31')
  })

  it('counts the streak back from today, not breaking on an unfinished today', () => {
    const days = [day('2026-10-10', { fiber: 10 }), day('2026-10-11', { fiber: 31 }), day('2026-10-12', { fiber: 35 }), day('2026-10-13', { fiber: 5 })]
    expect(streak(days, 'fiber', goals, '2026-10-13')).toBe(2)
    expect(streak(days.map((d) => ({ ...d, fiber: 40 })), 'fiber', goals, '2026-10-13')).toBe(4)
    expect(streak([...days.slice(0, 3), day('2026-10-13', { kcal: 0 })], 'fiber', goals, '2026-10-13')).toBe(2)
    expect(streak([day('2026-10-12', { kcal: 0 }), day('2026-10-13', { fiber: 40 })], 'fiber', goals, '2026-10-13')).toBe(1)
    expect(streak([], 'fiber', goals, '2026-10-13')).toBe(0)
  })
})
