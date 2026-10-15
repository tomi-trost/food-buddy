import type { AnalysisResult, Ingredient, MealCreate, MealKind, MealPer, Nutrients, SnackKind } from '../api/types'
import { scale, sum } from '../lib/macros'

/** One line on the verdict. Grams are for ONE plate (what the photo shows). */
export type PlateItem = {
  key: string
  name: string // what the model called it
  grams: number
  ingredient: Ingredient | null // null = not resolved yet
}

export function fromAnalysis(result: AnalysisResult): PlateItem[] {
  return result.items.map((item, i) => ({
    key: `a${i}`,
    name: item.name,
    grams: item.grams,
    ingredient: item.ingredient,
  }))
}

export const unresolved = (items: PlateItem[]) => items.filter((i) => !i.ingredient).length

export function plateNutrients(items: PlateItem[]): Nutrients {
  return sum(items.flatMap((i) => (i.ingredient ? [scale(i.ingredient.per100, i.grams)] : [])))
}

/** Whole-recipe ingredient cost in EUR (plate × portions made). */
export function recipeCost(items: PlateItem[], portions: number): number {
  return items.reduce((acc, i) => acc + (i.ingredient ? (i.ingredient.price_per_100g * i.grams) / 100 : 0), 0) * portions
}

/** Ingredient names, heaviest first (recipe template order). */
export const byWeight = (items: PlateItem[]) =>
  [...items].filter((i) => i.ingredient).sort((a, b) => b.grams - a.grams).map((i) => i.ingredient!.name)

/** Merge an ingredient into the plate: adding one that's already there adds the grams. */
export function addIngredient(items: PlateItem[], ingredient: Ingredient, grams = 100): PlateItem[] {
  const existing = items.find((i) => i.ingredient?.id === ingredient.id)
  if (existing) return items.map((i) => (i === existing ? { ...i, grams: i.grams + grams } : i))
  return [...items, { key: `n${ingredient.id}-${items.length}`, name: ingredient.name, grams, ingredient }]
}

export function replaceIngredient(items: PlateItem[], key: string, ingredient: Ingredient): PlateItem[] {
  const target = items.find((i) => i.key === key)
  if (!target) return items
  const rest = items.filter((i) => i.key !== key)
  return addIngredient(rest, ingredient, target.grams)
}

/** How to count a snack from what's in it: one countable thing (cookies) in pieces, one liquid
 *  in ml, anything mixed (chia pudding) in portions. */
export function snackCount(items: PlateItem[]): { per: MealPer; pieceG: number } {
  const resolved = items.filter((i) => i.ingredient && i.grams > 0)
  const only = resolved.length === 1 ? resolved[0].ingredient! : null
  if (only && (only.unit === 'pc' || only.unit === 'slice')) return { per: 'piece', pieceG: only.unit_grams }
  if (only && only.unit === 'ml') return { per: '100ml', pieceG: 100 }
  return { per: 'portion', pieceG: 100 }
}

export type SnackChoice = { kind: SnackKind; per: MealPer; pieceG: number }

export function toMealCreate(args: {
  items: PlateItem[]
  name: string
  mealType: MealKind
  eaten: boolean
  eatenOn: string
  prepMinutes: number
  portions: number
  servingsEaten: number
  cost: number | null
  usedUp: number[]
  analysisId: number | null
  perPortion?: Nutrients | null // typed-in values instead of the ingredients'
  snack?: SnackChoice // when mealType is snack
}): MealCreate {
  const resolved = args.items.filter((i) => i.ingredient && i.grams > 0)
  return {
    name: args.name.trim(),
    meal_type: args.mealType,
    eaten: args.eaten,
    eaten_on: args.eaten ? args.eatenOn : null,
    prep_minutes: args.prepMinutes,
    portions: args.portions,
    servings_eaten: args.servingsEaten,
    cost: args.cost,
    items: resolved.map((i) => ({ ingredient_id: i.ingredient!.id, grams: i.grams })),
    // saved for later: nothing was cooked, so nothing can be used up
    used_up: args.eaten ? args.usedUp.filter((id) => resolved.some((i) => i.ingredient!.id === id)) : [],
    analysis_id: args.analysisId,
    per_portion: args.perPortion ?? null,
    ...(args.mealType === 'snack' && args.snack
      ? { snack_kind: args.snack.kind, per: args.snack.per, piece_g: args.snack.per === 'piece' ? args.snack.pieceG : null }
      : {}),
  }
}
