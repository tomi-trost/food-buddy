import { describe, expect, it } from 'vitest'
import { card } from '../test/fixtures'
import { ago, feed, fillTip } from './meals'

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
