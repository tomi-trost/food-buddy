import type { Nutrients, Product, SnackIn, SnackKind } from '../api/types'
import { scale } from './macros'
import { piecesIn } from './snacks'

export { piecesIn }

const NO_VALUES: Nutrients = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0 }

/** Digits of an EAN-8 / UPC-A / EAN-13 / GTIN-14 (spaces and dashes as typed are fine), else null. */
export function cleanBarcode(text: string): string | null {
  const digits = text.replace(/[\s-]/g, '')
  return /^\d{8,14}$/.test(digits) ? digits : null
}

export type ProductSnack = {
  name: string
  kind: SnackKind
  per: '100g' | '100ml' // drinks in ml
  amount: number // grams / ml, or pieces when pieceG is set
  perUnit: Nutrients // always per 100 g / 100 ml
  missingValues: boolean // OFF has no values: the user types them from the label
  pieceG: number | null // counted in pieces (cookies): one piece weighs this; null = weighed
  servingG: number | null // the pack's serving: a first guess for one piece
}

/** A product Open Food Facts doesn't know: typed in from the pack (then remembered). */
export const unknownProduct = (): ProductSnack => ({
  name: '', kind: 'savory', per: '100g', amount: 100, perUnit: NO_VALUES, missingValues: true, pieceG: null, servingG: null,
})

/** A scanned product as a snack draft: per 100 g (drinks: 100 ml), one serving eaten. */
export function productSnack(p: Product): ProductSnack {
  const brand = p.brand && !p.name.toLowerCase().includes(p.brand.toLowerCase()) ? p.brand : ''
  const name = [brand, p.name].filter(Boolean).join(' ') || `Product ${p.code}`
  const serving = p.serving_g && p.serving_g > 0 ? Math.min(2000, Math.max(1, Math.round(p.serving_g))) : 100
  const pieceG = p.piece_g && p.piece_g > 0 ? p.piece_g : null // we counted it last time
  return {
    name: name.slice(0, 120),
    kind: p.kind,
    per: p.per ?? '100g',
    amount: pieceG ? piecesIn(p.serving_g ?? pieceG, pieceG) : serving,
    perUnit: p.per100 ?? NO_VALUES,
    missingValues: p.per100 === null,
    pieceG,
    servingG: p.serving_g && p.serving_g > 0 ? p.serving_g : null,
  }
}

/** First guess for one piece when switching to counting: the pack's serving, else 10 g. */
export const guessPieceG = (servingG: number | null, ml = false) =>
  servingG && servingG <= (ml ? 1000 : 200) ? Math.round(servingG * 10) / 10 : 10 // a 330 ml can is one piece

/** What gets logged: per 100 g/ml with grams/ml, or per piece with the count and the piece
 *  weight (in grams or ml, `base`). */
export function scannedAmount(
  per100: Nutrients, amount: number, pieceG: number | null, base: '100g' | '100ml' = '100g',
): Pick<SnackIn, 'per' | 'amount' | 'per_unit' | 'piece_g' | 'piece_base'> {
  if (!pieceG) return { per: base, amount, per_unit: per100 }
  return { per: 'piece', amount, per_unit: scale(per100, pieceG), piece_g: pieceG, piece_base: base }
}
