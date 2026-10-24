import { describe, expect, it } from 'vitest'
import type { Product } from '../api/types'
import { cleanBarcode, guessPieceG, piecesIn, productSnack, scannedAmount, unknownProduct } from './barcode'
import { scale } from './macros'

const per100 = { kcal: 539, protein: 6.3, carbs: 57.5, fat: 30.9, fiber: 0, sugar: 56.3 }
const product = (over: Partial<Product> = {}): Product => ({
  code: '8000500310427', name: 'Nutella', brand: 'Ferrero', quantity: '400 g', per: '100g', serving_g: 15, piece_g: null,
  image_url: null, per100, kind: 'sweet', remembered: false, meal_id: null, source: 'Open Food Facts', ingredient: null, ...over,
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
      pieceG: null, servingG: 15,
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

describe('drinks', () => {
  it('open in ml when the product is per 100 ml', () => {
    expect(productSnack(product({ per: '100ml', serving_g: 330 }))).toMatchObject({ per: '100ml', amount: 330 })
  })

  it('log per 100 ml, or per piece with the piece in ml', () => {
    expect(scannedAmount(per100, 330, null, '100ml')).toEqual({ per: '100ml', amount: 330, per_unit: per100 })
    expect(scannedAmount(per100, 2, 330, '100ml')).toMatchObject({ per: 'piece', piece_g: 330, piece_base: '100ml' })
  })

  it('a can is one piece', () => {
    expect(guessPieceG(330, true)).toBe(330)
    expect(guessPieceG(330)).toBe(10)
  })
})

describe('unknownProduct', () => {
  it('starts nameless with zero values to type in, per 100 g', () => {
    expect(unknownProduct()).toEqual({
      name: '', kind: 'savory', per: '100g', amount: 100,
      perUnit: { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0 }, missingValues: true, pieceG: null, servingG: null,
    })
  })
})

describe('counting scanned products in pieces', () => {
  it('opens in pieces when we counted it last time', () => {
    const cookies = productSnack(product({ remembered: true, serving_g: 27, piece_g: 9 }))
    expect(cookies).toMatchObject({ per: '100g', amount: 3, pieceG: 9, servingG: 27, perUnit: per100 })
  })

  it('rounds to halves and never below half a piece', () => {
    expect(piecesIn(27, 9)).toBe(3)
    expect(piecesIn(31, 9)).toBe(3.5)
    expect(piecesIn(2, 9)).toBe(0.5)
  })

  it('guesses one piece from the pack serving, else 10 g', () => {
    expect(guessPieceG(9)).toBe(9)
    expect(guessPieceG(12.34)).toBe(12.3)
    expect(guessPieceG(null)).toBe(10)
    expect(guessPieceG(250)).toBe(10) // a 250 g "serving" is not a piece
  })

  it('logs per piece with the piece weight, or per 100 g with grams', () => {
    expect(scannedAmount(per100, 3, 9)).toEqual({ per: 'piece', amount: 3, per_unit: scale(per100, 9), piece_g: 9, piece_base: '100g' })
    expect(scannedAmount(per100, 27, null)).toEqual({ per: '100g', amount: 27, per_unit: per100 })
  })
})
