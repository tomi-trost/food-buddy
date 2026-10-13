import type { Nutrients, Product, SnackKind } from '../api/types'

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
  amount: number // grams: one serving if the pack says, else 100
  perUnit: Nutrients
  missingValues: boolean // OFF has no values: the user types them from the label
}

/** A product Open Food Facts doesn't know: typed in from the pack (then remembered). */
export const unknownProduct = (): ProductSnack => ({
  name: '', kind: 'savory', per: '100g', amount: 100, perUnit: NO_VALUES, missingValues: true,
})

/** A scanned product as a snack draft: per 100 g, one serving eaten. */
export function productSnack(p: Product): ProductSnack {
  const brand = p.brand && !p.name.toLowerCase().includes(p.brand.toLowerCase()) ? p.brand : ''
  const name = [brand, p.name].filter(Boolean).join(' ') || `Product ${p.code}`
  const serving = p.serving_g && p.serving_g > 0 ? Math.min(2000, Math.max(1, Math.round(p.serving_g))) : 100
  return {
    name: name.slice(0, 120),
    kind: p.kind,
    per: '100g',
    amount: serving,
    perUnit: p.per100 ?? NO_VALUES,
    missingValues: p.per100 === null,
  }
}
