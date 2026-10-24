import type { Ingredient } from '../api/types'

// Amounts are stored in grams; eggs, fruit, bread slices… are shown and typed as pieces, liquids
// as ml (unit_grams = grams per piece, or g per ml; from the API).

export type Unit = Ingredient['unit']
type Counted = Pick<Ingredient, 'unit' | 'unit_grams'>

const NAMES: Record<Exclude<Unit, 'g' | 'ml'>, [string, string]> = {
  pc: ['pc', 'pcs'],
  slice: ['slice', 'slices'],
  clove: ['clove', 'cloves'],
}

export const isCounted = (u: Counted) => u.unit === 'pc' || u.unit === 'slice' || u.unit === 'clove'
const per = (u: Counted) => (u.unit_grams > 0 ? u.unit_grams : 1)

export const toAmount = (grams: number, u: Counted) => grams / per(u)
export const toGrams = (amount: number, u: Counted) => Math.round(amount * per(u) * 10) / 10

/** Halves for pieces, whole ml and grams; `up` rounds up (shopping: no half eggs). */
export function roundAmount(amount: number, u: Counted, up = false): number {
  const q = isCounted(u) ? (up ? 1 : 0.5) : 1
  const r = (up ? Math.ceil(amount / q - 1e-9) : Math.round(amount / q)) * q
  return amount > 0 && r === 0 ? q : r // never show "0 pcs" for something that's there
}

export function unitLabel(u: Counted, amount = 1): string {
  if (u.unit === 'g' || u.unit === 'ml') return u.unit
  const [one, many] = NAMES[u.unit]
  return amount === 1 ? one : many
}

export function formatAmount(grams: number, u: Counted, up = false): string {
  const a = roundAmount(toAmount(grams, u), u, up)
  return `${a} ${unitLabel(u, a)}`
}

/** Stepper settings in the ingredient's own unit. */
export function amountStepper(u: Counted) {
  if (isCounted(u)) return { step: 1, min: 0.1, max: Math.max(1, Math.floor(5000 / per(u))), decimals: 1 }
  return { step: 25, min: 1, max: u.unit === 'ml' ? Math.floor(5000 / per(u)) : 5000, decimals: 1 }
}
