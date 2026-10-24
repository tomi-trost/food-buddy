import { describe, expect, it } from 'vitest'
import { card, ING, meal } from '../test/fixtures'
import {
  addDish, byWeight, dishPortions, fromMeal, makeDish, type PlateItem, plateNutrients, recipeCost, replaceIngredient, replaceWithDish,
  splitDish, suggestDishName, toComponents, toMealCreate, usableIngredients,
} from './plate'
import { dishOptions } from '../ui/IngredientPicker'

// "pancakes" swapped for what we used: banana 100 g (89 kcal) + oats 50 g (194.5 kcal), plus rice on the side
const plate = (): PlateItem[] => [
  { key: 'a', name: 'pancakes', grams: 100, ingredient: ING.banana, swappedFrom: 'pancakes' }, // we picked Banana
  { key: 'b', name: 'oats', grams: 50, ingredient: ING.oats },
  { key: 'c', name: 'rice', grams: 200, ingredient: ING.rice },
]

describe('bundles: swapping', () => {
  it('remembers what the photo called an item we replaced, in place', () => {
    const items: PlateItem[] = [
      { key: 'a', name: 'pancakes', grams: 120, ingredient: null },
      { key: 'b', name: 'cooked rice', grams: 50, ingredient: ING.rice },
    ]
    const swapped = replaceIngredient(items, 'a', ING.banana)
    expect(swapped[0]).toMatchObject({ key: 'a', name: 'pancakes', grams: 120, ingredient: ING.banana, swappedFrom: 'pancakes' })
    // swapping again keeps the photo's name; merging into an ingredient on the plate carries it over
    expect(replaceIngredient(swapped, 'a', ING.oats)[0].swappedFrom).toBe('pancakes')
    const merged = replaceIngredient(swapped, 'a', ING.rice)
    expect(merged).toEqual([{ ...items[1], grams: 170, swappedFrom: 'pancakes' }])
    // same name as the ingredient: nothing was wrong
    expect(replaceIngredient([{ key: 'x', name: 'banana', grams: 1, ingredient: null }], 'x', ING.banana)[0].swappedFrom).toBeUndefined()
  })
})

describe('bundles: making a dish', () => {
  it('names it after what the photo called a swapped item', () => {
    expect(suggestDishName(plate().slice(0, 2))).toBe('Pancakes')
    expect(suggestDishName([{ key: 'x', name: 'Banana', grams: 1, ingredient: ING.banana }])).toBe('')
  })

  it('turns the selection into one portion of a new dish, keeping nutrition and cost', () => {
    const before = plate()
    const items = makeDish(before, ['a', 'b'], ' Banana pancakes ', 4)
    expect(items.map((i) => i.dish?.name ?? i.ingredient!.name)).toEqual(['Banana pancakes', 'Rice (cooked)'])
    const [dish] = items
    // "oats" only matched Rolled oats: not something the photo got wrong, so no alias
    expect(dish.dish).toMatchObject({ id: null, emoji: '🍌', portionG: 150, made: 4, detected: ['pancakes'] })
    expect(dishPortions(dish)).toBe(1)
    expect(plateNutrients(items).kcal).toBeCloseTo(plateNutrients(before).kcal)
    expect(recipeCost(items, 2)).toBeCloseTo(recipeCost(before, 2))
    expect(byWeight(items)).toEqual(['Rice (cooked)', 'Banana pancakes'])
  })

  it('in Edit meal the grams are for the whole recipe: one portion of the dish is a plate’s share', () => {
    const recipe = plate().map((i) => ({ ...i, grams: i.grams * 2 })) // 2 portions
    const [dish] = makeDish(recipe, ['a', 'b'], 'Pancakes', 2, 2)
    expect(dish.dish!.parts.map((p) => p.grams)).toEqual([100, 50])
    expect(dishPortions(dish)).toBe(2)
    expect(toComponents([dish])).toEqual([{
      new: { name: 'Pancakes', portions: 2, items: [{ ingredient_id: 23, grams: 100 }, { ingredient_id: 20, grams: 50 }] },
      portions: 2,
      aliases: ['pancakes'], // what the photo called it: offered as this dish next time
    }])
  })

  it('ignores an empty selection or one without ingredients', () => {
    const items = plate()
    expect(makeDish(items, [], 'X', 1)).toBe(items)
    expect(makeDish(items, ['nope'], 'X', 1)).toBe(items)
  })

  it('splits a new dish back into its ingredients for the portions on the plate', () => {
    const items = makeDish(plate(), ['a', 'b'], 'Pancakes', 4)
    const doubled = items.map((i) => (i.dish ? { ...i, grams: i.grams * 2 } : i))
    const split = splitDish(doubled, doubled[0].key)
    expect(split.map((i) => [i.ingredient!.name, i.grams])).toEqual([['Rice (cooked)', 200], ['Banana', 200], ['Rolled oats', 100]])
    expect(splitDish(split, 'missing')).toBe(split)
  })
})

describe('bundles: our meals as dishes', () => {
  const pancakes = card({ id: 7, name: 'Banana pancakes', emoji: '🥞', portions: 4, cost: 2.4, portion_g: 300, per_portion: { kcal: 400, protein: 15, carbs: 60, fat: 10, fiber: 6, sugar: 20 } })

  it('adds one portion, once', () => {
    const items = addDish(plate(), pancakes)
    expect(items).toHaveLength(4)
    expect(items[3]).toMatchObject({ grams: 300, ingredient: null, dish: { id: 7, costPerPortion: 0.6 } })
    expect(addDish(items, pancakes)).toBe(items)
    expect(plateNutrients(items).kcal).toBeCloseTo(89 + 194.5 + 260 + 400)
    expect(toComponents(items)).toEqual([{ meal_id: 7, portions: 1 }])
  })

  it('replaces a detected item in place, remembering what the photo called it', () => {
    const items = replaceWithDish(plate(), 'a', pancakes, 2)
    expect(items.map((i) => i.key.startsWith('d') ? 'dish' : i.key)).toEqual(['dish', 'b', 'c'])
    expect(items[0].dish!.detected).toEqual(['pancakes'])
    expect(dishPortions(items[0])).toBe(2)
    expect(toComponents(items)).toEqual([{ meal_id: 7, portions: 2, aliases: ['pancakes'] }])
  })

  it('reads a bundle for Edit meal', () => {
    const bundle = meal({
      portions: 2,
      components: [{
        id: 7, name: 'Pancakes', emoji: '🥞', portions: 2, grams: 600, photo_url: null, cost: 1.2,
        per_portion: { kcal: 400, protein: 15, carbs: 60, fat: 10, fiber: 6, sugar: 20 },
        ingredients: [{ ingredient: ING.banana, grams: 400 }, { ingredient: ING.oats, grams: 200 }],
      }],
    })
    const items = fromMeal(bundle)
    const dish = items.find((i) => i.dish)!
    expect(dish.dish).toMatchObject({ id: 7, portionG: 300, costPerPortion: 0.6 })
    expect(dish.dish!.parts.map((p) => p.grams)).toEqual([200, 100])
    expect(dishPortions(dish)).toBe(2)
    expect(toComponents(items)).toEqual([{ meal_id: 7, portions: 2 }])
  })

  it('offers only our cooked meals that hold no dishes', () => {
    const meals = [
      pancakes,
      card({ id: 8, name: 'Pancake plate', bundle: true }),
      card({ id: 9, name: 'Pancake mix', is_product: true }),
      card({ id: 10, name: 'Pancakes from the café', origin: 'out', listed: true }),
      card({ id: 11, name: 'Rice', cooked_count: 9 }),
    ]
    expect(dishOptions(meals, 'panc', []).map((m) => m.id)).toEqual([7])
    expect(dishOptions(meals, 'panc', [7])).toEqual([])
    expect(dishOptions(meals, '', []).map((m) => m.id)).toEqual([11, 7]) // most cooked first
  })
})

describe('bundles: posting', () => {
  it('sends the plate’s ingredients, its dishes and what was used up (dish ingredients too)', () => {
    const items = makeDish(plate(), ['a', 'b'], 'Pancakes', 4)
    const body = toMealCreate({
      items, name: 'Pancake plate', mealType: 'breakfast', eaten: true, eatenOn: '2026-10-04', prepMinutes: 20,
      portions: 2, servingsEaten: 1, cost: null, usedUp: [20, 2, 99], analysisId: 5,
    })
    expect(body.items).toEqual([{ ingredient_id: 2, grams: 200 }])
    expect(body.components).toEqual([{
      new: { name: 'Pancakes', portions: 4, items: [{ ingredient_id: 23, grams: 100 }, { ingredient_id: 20, grams: 50 }] },
      portions: 1,
      aliases: ['pancakes'],
    }])
    expect(body.used_up).toEqual([20, 2])
    expect(usableIngredients(items).map((i) => i.id)).toEqual([23, 20, 2])
  })
})
