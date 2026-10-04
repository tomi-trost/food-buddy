import { describe, expect, it } from 'vitest'
import { guessMealType, todayISO } from './dates'
import { templateSteps } from './recipe'

describe('templateSteps (same expectations as api/tests/test_recipes.py)', () => {
  it('matches the mock wording', () => {
    expect(templateSteps(['Chickpeas', 'Rice (cooked)', 'Tomatoes', 'Spinach', 'Onions'], 30, 4)).toEqual([
      'Prep: wash and chop chickpeas, rice (cooked), tomatoes.',
      'Heat a pan with oil; cook chickpeas until golden (~9 min).',
      'Add rice (cooked), tomatoes, spinach and simmer/stir for 12 min.',
      'Season, taste, adjust and serve in 4 portions.',
    ])
  })

  it('rounds half up and handles one or no ingredient', () => {
    expect(templateSteps(['Eggs'], 25, 1)[1]).toContain('~8 min')
    expect(templateSteps(['Eggs'], 10, 1)).toHaveLength(3)
    expect(templateSteps([], 10, 2)).toEqual(['Serve in 2 portions.'])
  })
})

describe('dates', () => {
  it('formats the local date and guesses the meal type like the mock', () => {
    expect(todayISO(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
    expect(guessMealType(new Date(2026, 0, 5, 10, 59))).toBe('breakfast')
    expect(guessMealType(new Date(2026, 0, 5, 15, 0))).toBe('lunch')
    expect(guessMealType(new Date(2026, 0, 5, 16, 0))).toBe('dinner')
  })
})
