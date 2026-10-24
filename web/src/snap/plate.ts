import type { AnalysisResult, ComponentIn, DishSource, Ingredient, Meal, MealCreate, MealKind, MealPer, Nutrients, Origin, SnackKind } from '../api/types'
import { scale, sum } from '../lib/macros'

type Part = { ingredient: Ingredient; grams: number }

/** A dish of ours on the plate (bundle, #17): one of our meals, or a new one made here from some
 *  of the plate's ingredients ("Make it its own dish"), created when the plate is saved. */
export type PlateDish = {
  id: number | null // null = new
  name: string
  emoji: string
  portionG: number // one portion weighs this
  perPortion: Nutrients
  costPerPortion: number
  made: number // new: portions we made of it
  parts: Part[] // one portion of it; [] = not known here (picked from our meals)
  detected: string[] // new: what the photo called the items it took the place of
}

/** One line on the verdict. Grams are for ONE plate (what the photo shows); in Edit meal, for the
 *  whole recipe. A dish's grams are its portions × the grams of one portion. */
export type PlateItem = {
  key: string
  name: string // what the model called it
  grams: number
  ingredient: Ingredient | null // null = not resolved yet (or a dish)
  dish?: PlateDish
  swappedFrom?: string // what the photo called it before we picked another ingredient ("pancakes")
}

export const isResolved = (i: PlateItem) => !!i.ingredient || !!i.dish
export const dishPortions = (i: PlateItem) => (i.dish ? i.grams / i.dish.portionG : 0)
const round = (v: number, step = 0.01) => Math.round(v / step) * step
export const portionsLabel = (p: number) => `${round(p)} portion${p === 1 ? '' : 's'}`

export function fromAnalysis(result: AnalysisResult): PlateItem[] {
  return result.items.map((item, i) => ({
    key: `a${i}`,
    name: item.name,
    grams: item.grams,
    ingredient: item.ingredient,
  }))
}

export const unresolved = (items: PlateItem[]) => items.filter((i) => !isResolved(i)).length

export function plateNutrients(items: PlateItem[]): Nutrients {
  return sum(items.flatMap((i) =>
    i.dish ? [scale(i.dish.perPortion, 100 * dishPortions(i))] : i.ingredient ? [scale(i.ingredient.per100, i.grams)] : []))
}

const itemCost = (i: PlateItem) =>
  i.dish ? i.dish.costPerPortion * dishPortions(i) : i.ingredient ? (i.ingredient.price_per_100g * i.grams) / 100 : 0

/** Whole-recipe ingredient cost in EUR (plate × portions made). */
export function recipeCost(items: PlateItem[], portions: number): number {
  return items.reduce((acc, i) => acc + itemCost(i), 0) * portions
}

/** Ingredient and dish names, heaviest first (recipe template order). */
export const byWeight = (items: PlateItem[]) =>
  [...items].filter(isResolved).sort((a, b) => b.grams - a.grams).map((i) => i.dish?.name ?? i.ingredient!.name)

function dishItem(dish: PlateDish, portions: number, key: string): PlateItem {
  return { key, name: dish.name, grams: portions * dish.portionG, ingredient: null, dish }
}

/** One of our meals as a dish: `portions` of it (1 per plate on the check screen). */
export function addDish(items: PlateItem[], meal: DishSource, portions = 1): PlateItem[] {
  if (items.some((i) => i.dish?.id === meal.id)) return items
  const dish: PlateDish = {
    id: meal.id, name: meal.name, emoji: meal.emoji, portionG: meal.portion_g > 0 ? meal.portion_g : 1,
    perPortion: meal.per_portion, costPerPortion: meal.cost / meal.portions, made: meal.portions, parts: [], detected: [],
  }
  return [...items, dishItem(dish, portions, `d${meal.id}-${items.length}`)]
}

/** "Which ingredient is 'pancakes'?" → our pancakes: the dish takes the item's place. */
export function replaceWithDish(items: PlateItem[], key: string, meal: DishSource, portions = 1): PlateItem[] {
  const at = items.findIndex((i) => i.key === key)
  if (at < 0) return items
  const added = addDish(items.filter((i) => i.key !== key), meal, portions)
  if (added.length === items.length - 1) return added // already on the plate
  const dish = added[added.length - 1]
  const detected = swapName(items[at], meal.name)
  if (detected) dish.dish!.detected = [detected]
  return [...added.slice(0, at), dish, ...added.slice(at, -1)]
}

/** A name for a dish made from these items: what the photo called one of them, if we swapped it
 *  for what we really used ("pancakes" → banana, oats, egg), else nothing. */
export function suggestDishName(selected: PlateItem[]): string {
  const detected = selected.find((i) => i.swappedFrom)?.swappedFrom ?? ''
  return detected.charAt(0).toUpperCase() + detected.slice(1)
}

/** "Make it its own dish": the selected ingredients become a new meal of ours (`made` portions
 *  of it) and the plate holds the part of it that was there. `platePortions`: the items' grams
 *  are for that many plates (1 on the check screen, the recipe's portions in Edit meal). */
export function makeDish(items: PlateItem[], keys: string[], name: string, made: number, platePortions = 1): PlateItem[] {
  const selected = items.filter((i) => keys.includes(i.key) && i.ingredient && !i.dish)
  if (!selected.length) return items
  const parts = selected.map((i) => ({ ingredient: i.ingredient!, grams: round(i.grams / platePortions, 0.1) }))
  const portionG = parts.reduce((acc, p) => acc + p.grams, 0)
  const asItems = parts.map((p, n) => ({ key: `p${n}`, name: p.ingredient.name, grams: p.grams, ingredient: p.ingredient }))
  const dish: PlateDish = {
    id: null, name: name.trim(), emoji: [...parts].sort((a, b) => b.grams - a.grams)[0].ingredient.emoji, portionG,
    perPortion: plateNutrients(asItems), costPerPortion: recipeCost(asItems, 1), made, parts,
    detected: [...new Set(selected.flatMap((i) => (i.swappedFrom ? [i.swappedFrom] : [])))], // not "oats" → Rolled oats
  }
  const at = items.findIndex((i) => i.key === selected[0].key)
  const rest = items.filter((i) => !selected.includes(i))
  const item = dishItem(dish, platePortions, `new-${items.length}-${Date.now()}`)
  return [...rest.slice(0, at), item, ...rest.slice(at)]
}

/** Back into its ingredients (for the dish's portions on the plate). */
export function splitDish(items: PlateItem[], key: string): PlateItem[] {
  const target = items.find((i) => i.key === key)
  if (!target?.dish?.parts.length) return items
  const portions = dishPortions(target)
  return target.dish.parts.reduce(
    (list, p) => addIngredient(list, p.ingredient, round(p.grams * portions, 0.1)),
    items.filter((i) => i !== target),
  )
}

/** Edit meal: the recipe's own ingredients and its dishes. */
export function fromMeal(meal: Meal): PlateItem[] {
  return [
    ...meal.ingredients.map(({ ingredient, grams }) => ({ key: `m${ingredient.id}`, name: ingredient.name, grams, ingredient })),
    ...meal.components.map((c) => dishItem({
      id: c.id, name: c.name, emoji: c.emoji, portionG: c.grams > 0 ? c.grams / c.portions : 1,
      perPortion: c.per_portion, costPerPortion: c.cost / c.portions, made: 0,
      parts: c.ingredients.map((p) => ({ ingredient: p.ingredient, grams: p.grams / c.portions })), detected: [],
    }, c.portions, `c${c.id}`)),
  ]
}

/** The dishes as the API takes them: portions for as many plates as the items' grams are for. */
export function toComponents(items: PlateItem[]): ComponentIn[] {
  return items.flatMap((i): ComponentIn[] => {
    if (!i.dish || i.grams <= 0) return []
    const portions = Math.max(0.01, round(dishPortions(i)))
    const aliases = i.dish.detected.length ? { aliases: i.dish.detected } : {} // the dish is offered for these next time
    if (i.dish.id !== null) return [{ meal_id: i.dish.id, portions, ...aliases }]
    return [{
      new: { name: i.dish.name.trim() || i.name, portions: i.dish.made, items: i.dish.parts.map((p) => ({ ingredient_id: p.ingredient.id, grams: p.grams })) },
      portions,
      ...aliases,
    }]
  })
}

/** Ingredients that can be used up: the plate's own and its new dishes'. */
export function usableIngredients(items: PlateItem[]): Ingredient[] {
  const all = items.flatMap((i) => (i.ingredient && i.grams > 0 ? [i.ingredient] : i.dish?.id === null ? i.dish.parts.map((p) => p.ingredient) : []))
  return all.filter((ing, n) => all.findIndex((x) => x.id === ing.id) === n)
}

/** Merge an ingredient into the plate: adding one that's already there adds the grams. */
export function addIngredient(items: PlateItem[], ingredient: Ingredient, grams = 100): PlateItem[] {
  const existing = items.find((i) => i.ingredient?.id === ingredient.id)
  if (existing) return items.map((i) => (i === existing ? { ...i, grams: i.grams + grams } : i))
  return [...items, { key: `n${ingredient.id}-${items.length}`, name: ingredient.name, grams, ingredient }]
}

/** What the photo called an item, if we swapped it for something else. */
const swapName = (item: PlateItem, now: string) =>
  item.swappedFrom ?? (item.name.toLowerCase() !== now.toLowerCase() ? item.name : undefined)

/** Another ingredient in the item's place (same grams); one already on the plate gets the grams. */
export function replaceIngredient(items: PlateItem[], key: string, ingredient: Ingredient): PlateItem[] {
  const target = items.find((i) => i.key === key)
  if (!target) return items
  const swappedFrom = target.ingredient?.id === ingredient.id ? target.swappedFrom : swapName(target, ingredient.name)
  const existing = items.find((i) => i !== target && i.ingredient?.id === ingredient.id && !i.dish)
  if (existing) {
    return items.filter((i) => i !== target).map((i) =>
      i === existing ? { ...i, grams: i.grams + target.grams, swappedFrom: i.swappedFrom ?? swappedFrom } : i)
  }
  return items.map((i) => (i === target ? { ...i, ingredient, swappedFrom } : i))
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
  origin?: Origin // bought / out: one portion, cost = what we paid, nothing used up
  place?: string
}): MealCreate {
  const resolved = args.items.filter((i) => i.ingredient && i.grams > 0)
  const origin = args.origin ?? 'home'
  if (origin !== 'home') {
    return {
      ...toMealCreate({ ...args, origin: 'home', eaten: true, portions: 1, usedUp: [] }),
      origin,
      place: args.place?.trim() || null,
    }
  }
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
    components: toComponents(args.items),
    // saved for later: nothing was cooked, so nothing can be used up
    used_up: args.eaten ? args.usedUp.filter((id) => usableIngredients(args.items).some((i) => i.id === id)) : [],
    analysis_id: args.analysisId,
    per_portion: args.perPortion ?? null,
    ...(args.mealType === 'snack' && args.snack
      ? { snack_kind: args.snack.kind, per: args.snack.per, piece_g: args.snack.per === 'piece' ? args.snack.pieceG : null }
      : {}),
  }
}
