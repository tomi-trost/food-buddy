import { describe, expect, it } from 'vitest'
import { logEntry } from '../test/fixtures'
import { type TodayRow, todayRows } from './today'

const meal = (id: number, meal_type: 'breakfast' | 'lunch' | 'dinner', time: string) =>
  logEntry({ id, meal_type, logged_at: `2026-10-04T${time}:00` })
const snack = (id: number, time: string) =>
  logEntry({ id, meal_type: 'snack', kind: 'snack', snack_kind: 'sweet', meal_id: null, logged_at: `2026-10-04T${time}:00` })
const shape = (rows: TodayRow[]) =>
  rows.map((r) => (r.kind === 'meal' ? `${r.mealType}:${r.entries.map((e) => e.id).join(',')}` : `snack ${r.entry.id} ${r.time}`))

describe('todayRows', () => {
  it('lists empty meals without snacks', () => {
    expect(shape(todayRows([]))).toEqual(['breakfast:', 'lunch:', 'dinner:'])
  })

  it('puts each snack after the meal before it, by time', () => {
    const rows = todayRows([meal(1, 'breakfast', '07:40'), snack(2, '10:15'), meal(3, 'lunch', '13:00'), snack(4, '16:30'), snack(5, '15:05')])
    expect(shape(rows)).toEqual(['breakfast:1', 'snack 2 10:15', 'lunch:3', 'snack 5 15:05', 'snack 4 16:30', 'dinner:'])
  })

  it('uses usual meal times for meals not logged yet', () => {
    // no breakfast: 07:00 is before the usual 08:00; dinner usually 19:00
    expect(shape(todayRows([snack(1, '07:00'), snack(2, '21:30')]))).toEqual(['snack 1 07:00', 'breakfast:', 'lunch:', 'dinner:', 'snack 2 21:30'])
  })

  it('keeps the meal order when a meal was logged late', () => {
    // breakfast logged at 14:00 (forgot in the morning); a 13:00 snack still comes before it
    const rows = todayRows([meal(1, 'breakfast', '14:00'), snack(2, '13:00'), snack(3, '14:30')])
    expect(shape(rows)).toEqual(['snack 2 13:00', 'breakfast:1', 'lunch:', 'snack 3 14:30', 'dinner:'])
  })
})
