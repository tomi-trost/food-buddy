import { describe, expect, it } from 'vitest'
import { scale, sum, ZERO } from './macros'

const rice = { kcal: 130, protein: 2.7, carbs: 28, fat: 0.3, fiber: 0.4, sugar: 0 }

describe('macros', () => {
  it('scales per-100 g values by grams', () => {
    const r = scale(rice, 200)
    expect(r.kcal).toBe(260)
    expect(r.protein).toBeCloseTo(5.4)
  })

  it('treats negative grams as zero', () => {
    expect(scale(rice, -50)).toEqual(ZERO)
  })

  it('sums items; empty is zero', () => {
    expect(sum([scale(rice, 100), scale(rice, 50)]).kcal).toBe(195)
    expect(sum([])).toEqual(ZERO)
  })
})
