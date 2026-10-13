import type { Nutrients, Product, SnackIn, SnackKind } from '../api/types'
import { scale } from './macros'

const NO_VALUES: Nutrients = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0 }

/** Digits of an EAN-8 / UPC-A / EAN-13 / GTIN-14 (spaces and dashes as typed are fine), else null. */
export function cleanBarcode(text: string): string | null {
  const digits = text.replace(/[\s-]/g, '')
  return /^\d{8,14}$/.test(digits) ? digits : null
}

export type ProductSnack = {
  name: string
  kind: SnackKind
  per: '100g'
  amount: number // grams, or pieces when pieceG is set
  perUnit: Nutrients // always per 100 g
  missingValues: boolean // OFF has no values: the user types them from the label
  pieceG: number | null // counted in pieces (cookies): one piece weighs this; null = weighed
  servingG: number | null // the pack's serving: a first guess for one piece
}

/** A product Open Food Facts doesn't know: typed in from the pack (then remembered). */
export const unknownProduct = (): ProductSnack => ({
  name: '', kind: 'savory', per: '100g', amount: 100, perUnit: NO_VALUES, missingValues: true, pieceG: null, servingG: null,
})

/** A scanned product as a snack draft: per 100 g, one serving eaten. */
export function productSnack(p: Product): ProductSnack {
  const brand = p.brand && !p.name.toLowerCase().includes(p.brand.toLowerCase()) ? p.brand : ''
  const name = [brand, p.name].filter(Boolean).join(' ') || `Product ${p.code}`
  const serving = p.serving_g && p.serving_g > 0 ? Math.min(2000, Math.max(1, Math.round(p.serving_g))) : 100
  const pieceG = p.piece_g && p.piece_g > 0 ? p.piece_g : null // we counted it last time
  return {
    name: name.slice(0, 120),
    kind: p.kind,
    per: '100g',
    amount: pieceG ? piecesIn(p.serving_g ?? pieceG, pieceG) : serving,
    perUnit: p.per100 ?? NO_VALUES,
    missingValues: p.per100 === null,
    pieceG,
    servingG: p.serving_g && p.serving_g > 0 ? p.serving_g : null,
  }
}

/** How many pieces `grams` is, in halves, at least half a piece. */
export const piecesIn = (grams: number, pieceG: number) => Math.max(0.5, Math.round((grams / pieceG) * 2) / 2)

/** First guess for one piece when switching to counting: the pack's serving, else 10 g. */
export const guessPieceG = (servingG: number | null) => (servingG && servingG <= 200 ? Math.round(servingG * 10) / 10 : 10)

/** What gets logged: per 100 g with grams, or per piece with the count and the piece weight. */
export function scannedAmount(per100: Nutrients, amount: number, pieceG: number | null): Pick<SnackIn, 'per' | 'amount' | 'per_unit' | 'piece_g'> {
  if (!pieceG) return { per: '100g', amount, per_unit: per100 }
  return { per: 'piece', amount, per_unit: scale(per100, pieceG), piece_g: pieceG }
}
