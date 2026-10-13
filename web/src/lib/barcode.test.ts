import { describe, expect, it } from 'vitest'
import type { Product } from '../api/types'
import { cleanBarcode, productSnack, unknownProduct } from './barcode'

const per100 = { kcal: 539, protein: 6.3, carbs: 57.5, fat: 30.9, fiber: 0, sugar: 56.3 }
const product = (over: Partial<Product> = {}): Product => ({
  code: '8000500310427', name: 'Nutella', brand: 'Ferrero', quantity: '400 g', serving_g: 15,
  image_url: null, per100, kind: 'sweet', remembered: false, source: 'Open Food Facts', ...over,
})

describe('cleanBarcode', () => {
  it('keeps 8 to 14 digits, ignoring spaces and dashes', () => {
    expect(cleanBarcode('8000500310427')).toBe('8000500310427')
    expect(cleanBarcode(' 4 006381-333931 ')).toBe('4006381333931')
    expect(cleanBarcode('96385074')).toBe('96385074')
  })

  it('rejects too short, too long and non-digits', () => {
    expect(cleanBarcode('')).toBeNull()
    expect(cleanBarcode('1234567')).toBeNull()
    expect(cleanBarcode('123456789012345')).toBeNull()
    expect(cleanBarcode('80005003104a7')).toBeNull()
  })
})

describe('productSnack', () => {
  it('is per 100 g with one serving eaten and the brand in front', () => {
    expect(productSnack(product())).toEqual({
      name: 'Ferrero Nutella', kind: 'sweet', per: '100g', amount: 15, perUnit: per100, missingValues: false,
    })
  })

  it('does not repeat a brand already in the name', () => {
    expect(productSnack(product({ name: 'Milka Alpine Milk', brand: 'milka' })).name).toBe('Milka Alpine Milk')
  })

  it('falls back to 100 g without a serving and rounds odd servings', () => {
    expect(productSnack(product({ serving_g: null })).amount).toBe(100)
    expect(productSnack(product({ serving_g: 0 })).amount).toBe(100)
    expect(productSnack(product({ serving_g: 27.6 })).amount).toBe(28)
    expect(productSnack(product({ serving_g: 0.2 })).amount).toBe(1)
  })

  it('names nameless products by brand or code', () => {
    expect(productSnack(product({ name: '' })).name).toBe('Ferrero')
    expect(productSnack(product({ name: '', brand: '' })).name).toBe('Product 8000500310427')
  })

  it('starts from zeros when Open Food Facts has no values', () => {
    const snack = productSnack(product({ per100: null }))
    expect(snack.missingValues).toBe(true)
    expect(snack.perUnit).toEqual({ kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0 })
  })
})

describe('unknownProduct', () => {
  it('starts nameless with zero values to type in, per 100 g', () => {
    expect(unknownProduct()).toEqual({
      name: '', kind: 'savory', per: '100g', amount: 100,
      perUnit: { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0 }, missingValues: true,
    })
  })
})
