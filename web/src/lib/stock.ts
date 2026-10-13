import type { Ingredient } from '../api/types'
import { isCounted, toGrams } from './units'

/** Mock wording: months for long shelf life, warnings when close. */
export function expiryText(daysLeft: number): string {
  if (daysLeft < 0) return 'expired'
  if (daysLeft >= 60) return `${Math.round(daysLeft / 30)} months left`
  if (daysLeft <= 1) return 'expires today/tomorrow'
  return `${daysLeft} days left`
}

export const expiryClass = (daysLeft: number) => (daysLeft <= 1 ? 'exp-1' : daysLeft <= 3 ? 'exp-2' : 'exp-3')

export const STEP_GRAMS = 50

/** −/+ on a stock row: one piece/slice/clove, 100 ml, or 50 g (in grams). */
export const stockStep = (ing: Pick<Ingredient, 'unit' | 'unit_grams'>) =>
  isCounted(ing) ? ing.unit_grams : ing.unit === 'ml' ? toGrams(100, ing) : STEP_GRAMS
