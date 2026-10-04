import type { AnalysisResult, Ingredient, MealCreate, MealType, Nutrients } from '../api/types'
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

export function toMealCreate(args: {
  items: PlateItem[]
  name: string
  mealType: MealType
  eatenOn: string
  prepMinutes: number
  portions: number
  servingsEaten: number
  cost: number | null
  usedUp: number[]
  analysisId: number | null
}): MealCreate {
  const resolved = args.items.filter((i) => i.ingredient && i.grams > 0)
  return {
    name: args.name.trim(),
    meal_type: args.mealType,
    eaten_on: args.eatenOn,
    prep_minutes: args.prepMinutes,
    portions: args.portions,
    servings_eaten: args.servingsEaten,
    cost: args.cost,
    items: resolved.map((i) => ({ ingredient_id: i.ingredient!.id, grams: i.grams })),
    used_up: args.usedUp.filter((id) => resolved.some((i) => i.ingredient!.id === id)),
    analysis_id: args.analysisId,
  }
}
