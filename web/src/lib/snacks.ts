import type { LogEntry, Nutrients, SnackKind, SnackResult } from '../api/types'
import { scale } from './macros'

export const SNACK_KINDS: SnackKind[] = ['sweet', 'savory', 'fruit', 'drink']
export const KIND_LABEL: Record<SnackKind, string> = { sweet: 'Sweet', savory: 'Savory', fruit: 'Fruit', drink: 'Drink' }
export const KIND_EMOJI: Record<SnackKind, string> = { sweet: '🍪', savory: '🥨', fruit: '🍎', drink: '🥤' }

/** Sweets and sugary drinks are treats; fruit and savory snacks aren't (decisions 0014, 0024). */
export const isTreatKind = (kind: SnackKind | null) => kind === 'sweet' || kind === 'drink'

/** Croissant rewards don't count as treats either (decisions 0011, 0012). */
export const isTreat = (e: Pick<LogEntry, 'kind' | 'snack_kind' | 'is_reward'>) =>
  e.kind === 'snack' && isTreatKind(e.snack_kind) && !e.is_reward

/** Values for the amount eaten: pieces × per-piece, or grams × per-100 g / 100. */
export function snackNutrients(s: Pick<SnackResult, 'per' | 'amount' | 'per_unit'>): Nutrients {
  return scale(s.per_unit, s.per === 'piece' ? s.amount * 100 : s.amount)
}

export const amountStep = (per: SnackResult['per']) => (per === 'piece' ? 0.5 : 5)

export function treatSugarToday(entries: LogEntry[]): { snacks: number; sugar: number } {
  const snacks = entries.filter((e) => e.kind === 'snack')
  return { snacks: snacks.length, sugar: snacks.filter(isTreat).reduce((a, e) => a + e.nutrients.sugar, 0) }
}
