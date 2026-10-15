import { describe, expect, it } from 'vitest'
import { card } from '../test/fixtures'
import { ago, feed, fillTip, pickable } from './meals'

describe('ago', () => {
  it('describes days since a date', () => {
    expect(ago('2026-10-04', '2026-10-04')).toBe('Today')
    expect(ago('2026-10-03', '2026-10-04')).toBe('Yesterday')
    expect(ago('2026-09-28', '2026-10-04')).toBe('6 days ago')
    expect(ago(null, '2026-10-04')).toBe('Never')
  })
})

describe('fillTip', () => {
  const r = (fill: 'hungry' | 'right' | 'heavy') => ({ taste: 4, again: 5 as const, effort: 5 as const, fill })
  it('follows the majority, like the mock', () => {
    expect(fillTip([r('hungry'), null])).toMatch(/^Left us hungry/)
    expect(fillTip([r('heavy'), r('right')])).toMatch(/^A bit heavy/)
    expect(fillTip([r('hungry'), r('heavy')])).toBe('Portion feels right.')
    expect(fillTip([null, null])).toBeNull()
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
