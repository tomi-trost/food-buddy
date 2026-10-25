import { describe, expect, it } from 'vitest'
import type { Slider } from '../api/types'
import { card } from '../test/fixtures'
import { ago, averagePortion, byFamily, EFFORT_STEPS, energySplit, feed, FILL_STEPS, fillTip, pickable, stepLabel } from './meals'

describe('ago', () => {
  it('describes days since a date', () => {
    expect(ago('2026-10-04', '2026-10-04')).toBe('Today')
    expect(ago('2026-10-03', '2026-10-04')).toBe('Yesterday')
    expect(ago('2026-09-28', '2026-10-04')).toBe('6 days ago')
    expect(ago(null, '2026-10-04')).toBe('Never')
  })
})

describe('fillTip', () => {
  const r = (fill: Slider | null) => ({ taste: 4, again: 5 as const, effort: 0 as const, fill })
  it('follows the average slider', () => {
    expect(fillTip([r(-2), null])).toMatch(/^Left us hungry/)
    expect(fillTip([r(3), r(-1)])).toMatch(/^A bit heavy/) // average +1
    expect(fillTip([r(-3), r(3)])).toBe('Portion feels right.')
    expect(fillTip([r(-1), r(0)])).toBe('Portion feels right.') // a bit light only
    expect(fillTip([null, r(null)])).toBeNull() // nobody rated, or a snack
  })
})

describe('slider words', () => {
  it('names each of the 7 steps with meh / just right in the middle', () => {
    expect([stepLabel(EFFORT_STEPS, -3), stepLabel(EFFORT_STEPS, 0), stepLabel(EFFORT_STEPS, 3)]).toEqual(['Not really', 'Meh', 'Totally'])
    expect([stepLabel(FILL_STEPS, -3), stepLabel(FILL_STEPS, 0), stepLabel(FILL_STEPS, 3)]).toEqual(['Left us hungry', 'Just right', 'Too heavy'])
  })
})

describe('feed', () => {
  const cards = [
    card({ id: 1, name: 'Oats', types: ['breakfast'], prep_minutes: 5, cost: 2, score: 4.5, cooked_count: 5, last_cooked: '2026-09-20' }),
    card({ id: 2, name: 'Curry', types: ['lunch', 'dinner'], prep_minutes: 45, cost: 12, score: 3.9, cooked_count: 2, last_cooked: '2026-10-03' }),
    card({ id: 3, name: 'New', types: ['dinner'], prep_minutes: 25, cost: 20, score: null, cooked_count: 1, last_cooked: '2026-10-04' }),
  ]
  const names = (list: typeof cards) => list.map((c) => c.name)

  it('filters by type and segment', () => {
    expect(names(feed(cards, 'dinner', 'all', 'rating'))).toEqual(['Curry', 'New'])
    expect(names(feed(cards, 'all', 'quick', 'rating'))).toEqual(['Oats', 'New'])
    expect(names(feed(cards, 'all', 'top', 'rating'))).toEqual(['Oats'])
    expect(names(feed(cards, 'all', 'cheap', 'rating'))).toEqual(['Oats']) // ≤ 4 € per portion
  })

  it('sorts by rating, recency or times cooked', () => {
    expect(names(feed(cards, 'all', 'all', 'rating'))).toEqual(['Oats', 'Curry', 'New'])
    expect(names(feed(cards, 'all', 'all', 'recent'))).toEqual(['New', 'Curry', 'Oats'])
    expect(names(feed(cards, 'all', 'all', 'cooked'))).toEqual(['Oats', 'Curry', 'New'])
  })
})

describe('pickable', () => {
  const cards = [
    card({ id: 1, name: 'Curry', types: ['dinner'], last_cooked: '2026-10-09' }),
    card({ id: 2, name: 'Oats', types: ['breakfast'], last_cooked: '2026-10-10' }),
    card({ id: 3, name: 'Chicken curry bowl', types: ['lunch', 'dinner'], last_cooked: '2026-10-01' }),
    card({ id: 4, name: 'Toast', types: ['breakfast'], last_cooked: null }),
  ]

  it('puts meals for the slot first, then the most recently cooked', () => {
    expect(pickable(cards, 'breakfast', '').map((m) => m.id)).toEqual([2, 4, 1, 3])
    expect(pickable(cards, 'dinner', '').map((m) => m.id)).toEqual([1, 3, 2, 4])
  })

  it('filters by name, ignoring case and spaces around the query', () => {
    expect(pickable(cards, 'lunch', '  CURRY ').map((m) => m.id)).toEqual([3, 1])
    expect(pickable(cards, 'lunch', 'pizza')).toEqual([])
    expect(pickable([], 'lunch', '')).toEqual([])
  })
})

describe('feed with snacks (0025)', () => {
  const cards = [
    card({ id: 1, types: ['dinner'] }),
    card({ id: 2, types: ['snack'] }),
    card({ id: 3, types: ['breakfast', 'snack'] }),
  ]
  it('keeps snack-only meals out of All and shows every snack under Snacks', () => {
    expect(feed(cards, 'all', 'all', 'rating').map((m) => m.id).sort()).toEqual([1, 3])
    expect(feed(cards, 'snack', 'all', 'rating').map((m) => m.id).sort()).toEqual([2, 3])
  })
})

describe('byFamily', () => {
  it('groups by dish family, biggest first, Other last, with the best taste', () => {
    const groups = byFamily([
      card({ id: 1, family: 'Other', taste: 5 }),
      card({ id: 2, family: 'Pasta', taste: 4 }),
      card({ id: 3, family: 'Eggs', taste: null }),
      card({ id: 4, family: 'Pasta', taste: 4.5 }),
      card({ id: 5, family: 'Curries', taste: null }),
    ])
    expect(groups.map((g) => [g.family, g.meals.map((m) => m.id), g.best])).toEqual([
      ['Pasta', [2, 4], 4.5], ['Curries', [5], null], ['Eggs', [3], null], ['Other', [1], 5],
    ])
    expect(byFamily([])).toEqual([])
  })

  it('picks the three best-rated dishes for the collage (unrated last, most cooked breaks ties)', () => {
    const [pasta] = byFamily([
      card({ id: 1, family: 'Pasta', taste: null, cooked_count: 9 }),
      card({ id: 2, family: 'Pasta', taste: 4 }),
      card({ id: 3, family: 'Pasta', taste: 5 }),
      card({ id: 4, family: 'Pasta', taste: 4, cooked_count: 3 }),
      card({ id: 5, family: 'Pasta', taste: null, cooked_count: 1 }),
    ])
    expect(pasta.top.map((m) => m.id)).toEqual([3, 4, 2])
    expect(byFamily([card({ id: 7, family: 'Eggs', taste: null })])[0].top.map((m) => m.id)).toEqual([7])
  })
})

describe('family averages', () => {
  const n = (kcal: number, protein: number, carbs: number, fat: number) => ({ kcal, protein, carbs, fat, fiber: 0, sugar: 0 })
  it('averages a portion over the dishes, each counted once', () => {
    expect(averagePortion([card({ per_portion: n(600, 20, 80, 20) }), card({ per_portion: n(400, 10, 70, 10) })])).toEqual(n(500, 15, 75, 15))
    expect(averagePortion([])).toEqual(n(0, 0, 0, 0))
  })

  it('splits the energy into whole percent that add up to 100', () => {
    const split = energySplit(n(0, 10, 10, 10)) // 40 + 40 + 90 kcal
    expect(split.map((s) => s.pct)).toEqual([24, 23, 53])
    expect(split.reduce((a, s) => a + s.pct, 0)).toBe(100)
    expect(split[0]).toEqual({ key: 'protein', grams: 10, pct: 24 })
    expect(energySplit(n(0, 0, 0, 10)).map((s) => s.pct)).toEqual([0, 0, 100])
    expect(energySplit(n(120, 0, 0, 0))).toEqual([]) // nothing to split
  })
})
