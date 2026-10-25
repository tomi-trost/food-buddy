import { describe, expect, it } from 'vitest'
import { ING } from '../test/fixtures'
import { stockStep } from './stock'
import { amountStepper, formatAmount, rememberedSpoon, rememberSpoon, roundAmount, spoonGrams, spoonsOf, spoonsToGrams, toAmount, toGrams } from './units'

const slice = { unit: 'slice' as const, unit_grams: 30 }
const clove = { unit: 'clove' as const, unit_grams: 5 }

describe('units', () => {
  it('shows counted foods as pieces, liquids as ml, the rest as grams', () => {
    expect(formatAmount(100, ING.eggs)).toBe('2 pcs')
    expect(formatAmount(50, ING.eggs)).toBe('1 pc')
    expect(formatAmount(75, ING.eggs)).toBe('1.5 pcs') // halves
    expect(formatAmount(10, ING.oil)).toBe('11 ml') // 10 g / 0.91 = 11, whole ml
    expect(formatAmount(91, ING.oil)).toBe('100 ml')
    expect(formatAmount(150.4, ING.chicken)).toBe('150 g')
    expect(formatAmount(60, slice)).toBe('2 slices')
    expect(formatAmount(5, clove)).toBe('1 clove')
  })

  it('never shows zero for something that is there, and rounds up for shopping', () => {
    expect(formatAmount(5, ING.eggs)).toBe('0.5 pcs')
    expect(formatAmount(1, ING.oil)).toBe('1 ml') // 1.1 ml
    expect(formatAmount(0, ING.eggs)).toBe('0 pcs')
    expect(formatAmount(110, ING.eggs, true)).toBe('3 pcs') // no half eggs at the shop
    expect(roundAmount(2, ING.eggs, true)).toBe(2)
  })

  it('converts both ways', () => {
    expect(toAmount(150, ING.eggs)).toBe(3)
    expect(toGrams(3, ING.eggs)).toBe(150)
    expect(toGrams(100, ING.oil)).toBe(91)
    expect(toGrams(7, ING.chicken)).toBe(7)
    expect(toAmount(10, { unit: 'pc', unit_grams: 0 })).toBe(10) // bad data: treated as grams
  })

  it('steps in the ingredient unit', () => {
    expect(amountStepper(ING.eggs)).toEqual({ step: 1, min: 0.1, max: 100, decimals: 1 })
    expect(amountStepper(ING.oil)).toMatchObject({ step: 25, min: 1, decimals: 1 })
    expect(amountStepper(ING.chicken)).toEqual({ step: 25, min: 1, max: 5000, decimals: 1 })
    expect(stockStep(ING.eggs)).toBe(50) // one egg
    expect(stockStep(ING.oil)).toBe(91) // 100 ml
    expect(stockStep(ING.chicken)).toBe(50)
  })
})

describe('spoons', () => {
  const oats = { tbsp_g: 5 }
  it('counts tablespoons and teaspoons (a third) in halves', () => {
    expect(spoonGrams(oats, 'tbsp')).toBe(5)
    expect(spoonGrams({ tbsp_g: 15 }, 'tsp')).toBe(5)
    expect(spoonsToGrams(2, oats, 'tbsp')).toBe(10)
    expect(spoonsToGrams(1, { tbsp_g: 14 }, 'tsp')).toBe(4.7)
    expect(spoonsOf(12, oats, 'tbsp')).toBe(2.5)
    expect(spoonsOf(0, oats, 'tbsp')).toBe(0.5) // never 0 spoons
  })

  it('remembers the spoon per ingredient, and forgets it', () => {
    localStorage.clear()
    expect(rememberedSpoon(20)).toBeNull()
    rememberSpoon(20, 'tsp')
    expect(rememberedSpoon(20)).toBe('tsp')
    expect(rememberedSpoon(21)).toBeNull()
    rememberSpoon(20, null)
    expect(rememberedSpoon(20)).toBeNull()
    localStorage.setItem('spoon:5', 'cup')
    expect(rememberedSpoon(5)).toBeNull() // not a spoon we know
  })
})
