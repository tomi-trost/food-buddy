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

/** Spoons, for counting without a scale: a level teaspoon is a third of a tablespoon. Only a way
 *  to type the amount; it's still stored in grams. */
export type Spoon = 'tsp' | 'tbsp'

export const spoonGrams = (u: Pick<Ingredient, 'tbsp_g'>, spoon: Spoon) => (spoon === 'tbsp' ? u.tbsp_g : u.tbsp_g / 3)

/** How many spoons the grams are, in halves (at least half a spoon). */
export const spoonsOf = (grams: number, u: Pick<Ingredient, 'tbsp_g'>, spoon: Spoon) =>
  Math.max(0.5, Math.round((grams / spoonGrams(u, spoon)) * 2) / 2)

export const spoonsToGrams = (n: number, u: Pick<Ingredient, 'tbsp_g'>, spoon: Spoon) => Math.round(n * spoonGrams(u, spoon) * 10) / 10

const SPOON_KEY = 'spoon:' // per device: the spoon we last counted this ingredient in

export function rememberedSpoon(id: number): Spoon | null {
  try {
    const v = localStorage.getItem(SPOON_KEY + id)
    return v === 'tsp' || v === 'tbsp' ? v : null
  } catch {
    return null
  }
}

export function rememberSpoon(id: number, spoon: Spoon | null) {
  try {
    if (spoon) localStorage.setItem(SPOON_KEY + id, spoon)
    else localStorage.removeItem(SPOON_KEY + id)
  } catch {
    // private mode: just not remembered
  }
}
