import { describe, expect, it } from 'vitest'
import { parseNutrient, scale, sum, ZERO } from './macros'

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

describe('parseNutrient', () => {
  it('accepts dot and comma decimals', () => {
    expect(parseNutrient('fiber', '7,6')).toBe(7.6)
    expect(parseNutrient('fiber', '7.6')).toBe(7.6)
    expect(parseNutrient('kcal', ' 448 ')).toBe(448)
    expect(parseNutrient('fat', '0')).toBe(0)
    expect(parseNutrient('fat', ',5')).toBe(0.5)
    expect(parseNutrient('fat', '5.')).toBe(5) // mid-typing "5.5"
  })

  it('rejects empty, negative, non-numbers and values over the API limits', () => {
    for (const bad of ['', ' ', '-1', 'abc', '1.2.3', '1e3', '7,6,1']) expect(parseNutrient('protein', bad)).toBeNull()
    expect(parseNutrient('kcal', '5000')).toBe(5000)
    expect(parseNutrient('kcal', '5001')).toBeNull()
    expect(parseNutrient('fiber', '201')).toBeNull()
  })
})
