import type { LogEntry, Nutrients, SnackKind, SnackResult } from '../api/types'
import { scale } from './macros'

export const KIND_LABEL: Record<SnackKind, string> = { sweet: 'Sweet', savory: 'Savory', drink: 'Drink' }

/** Sweets and sugary drinks count as treats; croissant rewards don't (decisions 0011, 0012, 0014). */
export const isTreat = (e: Pick<LogEntry, 'kind' | 'snack_kind' | 'is_reward'>) =>
  e.kind === 'snack' && (e.snack_kind === 'sweet' || e.snack_kind === 'drink') && !e.is_reward

/** Values for the amount eaten: pieces × per-piece, or grams × per-100 g / 100. */
export function snackNutrients(s: Pick<SnackResult, 'per' | 'amount' | 'per_unit'>): Nutrients {
  return scale(s.per_unit, s.per === 'piece' ? s.amount * 100 : s.amount)
}

export const amountStep = (per: SnackResult['per']) => (per === 'piece' ? 0.5 : 5)

export function treatSugarToday(entries: LogEntry[]): { snacks: number; sugar: number } {
  const snacks = entries.filter((e) => e.kind === 'snack')
  return { snacks: snacks.length, sugar: snacks.filter(isTreat).reduce((a, e) => a + e.nutrients.sugar, 0) }
}
