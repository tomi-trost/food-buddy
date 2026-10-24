import type { LogEntry, Nutrients, SnackKind, SnackPer, SnackResult } from '../api/types'
import { scale } from './macros'

export const SNACK_KINDS: SnackKind[] = ['sweet', 'savory', 'fruit', 'drink']
export const KIND_LABEL: Record<SnackKind, string> = { sweet: 'Sweet', savory: 'Savory', fruit: 'Fruit', drink: 'Drink' }
export const KIND_EMOJI: Record<SnackKind, string> = { sweet: '🍪', savory: '🥨', fruit: '🍎', drink: '🥤' }

/** Sweets and sugary drinks are treats; fruit and savory snacks aren't (decisions 0014, 0024). */
export const isTreatKind = (kind: SnackKind | null) => kind === 'sweet' || kind === 'drink'

/** Croissant rewards don't count as treats either (decisions 0011, 0012). */
export const isTreat = (e: Pick<LogEntry, 'kind' | 'snack_kind' | 'is_reward'>) =>
  e.kind === 'snack' && isTreatKind(e.snack_kind) && !e.is_reward

type Amounted = Pick<SnackResult, 'per' | 'amount' | 'per_unit'>

/** Counted one by one (pieces, portions); else weighed in grams / ml. */
export const isCounted = (per: SnackPer) => per === 'piece' || per === 'portion'

/** Values for the amount eaten: pieces/portions × per-one, or grams/ml × per-100 / 100. */
export function snackNutrients(s: Amounted): Nutrients {
  return scale(s.per_unit, isCounted(s.per) ? s.amount * 100 : s.amount)
}

export const amountStep = (per: SnackPer) => (isCounted(per) ? 0.5 : 5)

/** Smallest amount you can log: the −/+ buttons step, but any amount can be typed. */
export const amountMin = (per: SnackPer) => (isCounted(per) ? 0.1 : 1)

/** "portion", "piece", "100 g", "100 ml": what the values are for. */
export const perLabel = (per: SnackPer) => (isCounted(per) ? per : per === '100ml' ? '100 ml' : '100 g')

/** Stepper suffix for an amount: " piece(s)", " portion(s)", " g", " ml". */
export function amountUnit(per: SnackPer, amount: number): string {
  if (isCounted(per)) return ` ${per}${amount === 1 ? '' : 's'}`
  return per === '100ml' ? ' ml' : ' g'
}

/** "how many pieces", "ml you drank"…: what the amount stepper asks. */
export const amountHint = (per: SnackPer) =>
  per === 'piece' ? 'how many pieces' : per === 'portion' ? 'how many portions' : per === '100ml' ? 'ml you drank' : 'grams you ate'

/** How many pieces `grams` is, in halves, at least half a piece. */
export const piecesIn = (grams: number, pieceG: number) => Math.max(0.5, Math.round((grams / pieceG) * 2) / 2)

/** Values as first given (`from`), kept while counting the other way: pieces ↔ g/ml need one
 *  piece's weight, which can still change. */
export type Crossed = { from: SnackPer; perUnit: Nutrients; pieceG: number }

/** The values in `per` for a snack first given in `c.from`. */
export function crossedValues(c: Crossed, per: SnackPer): Nutrients {
  if ((c.from === 'piece') === (per === 'piece')) return c.perUnit
  return per === 'piece' ? scale(c.perUnit, c.pieceG) : scale(c.perUnit, 10000 / c.pieceG)
}

const PORTION_G = 100 // first guess for one piece/portion when a counted snack is weighed instead

/** Count the snack another way. g ↔ ml keep the numbers (about 1 g per ml); pieces ↔ g/ml go
 *  through one piece's weight: the whole amount as one piece, or a 100 g portion to start. */
export function switchPer(s: Amounted, to: SnackPer, crossed: Crossed | null): { snack: Amounted; crossed: Crossed | null } {
  if (to === s.per) return { snack: s, crossed }
  if (s.per !== 'piece' && to !== 'piece') return { snack: { ...s, per: to }, crossed }
  const back = crossed !== null && (crossed.from === 'piece') === (to === 'piece')
  const c = back ? crossed : { from: s.per, perUnit: s.per_unit, pieceG: s.per === 'piece' ? PORTION_G : Math.max(1, s.amount) }
  const amount = to === 'piece' ? piecesIn(s.amount, c.pieceG) : Math.max(1, Math.round(s.amount * c.pieceG))
  return { snack: { per: to, amount, per_unit: crossedValues(c, to) }, crossed: back ? null : c }
}

export function treatSugarToday(entries: LogEntry[]): { snacks: number; sugar: number } {
  const snacks = entries.filter((e) => e.kind === 'snack')
  return { snacks: snacks.length, sugar: snacks.filter(isTreat).reduce((a, e) => a + e.nutrients.sugar, 0) }
}
