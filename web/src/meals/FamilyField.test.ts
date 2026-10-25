import { describe, expect, it } from 'vitest'
import { familyOptions } from './FamilyField'

describe('familyOptions', () => {
  const ours = ['Oats & chia', 'Pancakes & waffles', 'Pasta', 'Rice & grains']
  it('lists all of them before typing', () => expect(familyOptions(ours, ' ')).toEqual(ours))
  it('puts the ones starting with what’s typed first, then the ones containing it', () => {
    expect(familyOptions(ours, 'pa')).toEqual(['Pancakes & waffles', 'Pasta'])
    expect(familyOptions(ours, 'a')).toEqual(['Oats & chia', 'Pancakes & waffles', 'Pasta', 'Rice & grains'])
    expect(familyOptions(ours, 'grain')).toEqual(['Rice & grains'])
  })
  it('hides the one already typed in full, and is empty when nothing matches', () => {
    expect(familyOptions(ours, 'pasta')).toEqual([])
    expect(familyOptions(ours, 'Bowls')).toEqual([])
  })
})
