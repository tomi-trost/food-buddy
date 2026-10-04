import { describe, expect, it } from 'vitest'
import { doneJob, ING } from '../test/fixtures'
import { addIngredient, byWeight, fromAnalysis, plateNutrients, recipeCost, replaceIngredient, toMealCreate, unresolved } from './plate'

const items = () => fromAnalysis(doneJob().result!)

describe('plate', () => {
  it('counts unresolved items and only sums matched ones', () => {
    expect(unresolved(items())).toBe(1)
    expect(plateNutrients(items()).kcal).toBeCloseTo(507.5)
  })

  it('estimates the whole-recipe cost', () => {
    expect(recipeCost(items(), 2)).toBeCloseTo(3.5)
  })

  it('adding an existing ingredient adds grams instead of duplicating', () => {
    const next = addIngredient(items(), ING.rice, 50)
    expect(next).toHaveLength(3)
    expect(next.find((i) => i.ingredient?.id === 2)!.grams).toBe(250)
  })

  it('replacing keeps the grams and merges duplicates', () => {
    const list = items()
    const sauce = list.find((i) => !i.ingredient)!
    expect(replaceIngredient(list, sauce.key, ING.soy).find((i) => i.ingredient?.id === 4)!.grams).toBe(30)
    const merged = replaceIngredient(list, sauce.key, ING.rice)
    expect(merged).toHaveLength(2)
    expect(merged.find((i) => i.ingredient?.id === 2)!.grams).toBe(230)
  })

  it('orders recipe names by weight and builds the request', () => {
    expect(byWeight(items())).toEqual(['Rice (cooked)', 'Chicken breast'])
    const body = toMealCreate({
      items: items(), name: '  Bowl ', mealType: 'dinner', eatenOn: '2026-10-04', prepMinutes: 20,
      portions: 2, servingsEaten: 1, cost: null, usedUp: [2, 99], analysisId: 5,
    })
    expect(body.name).toBe('Bowl')
    expect(body.items).toEqual([{ ingredient_id: 1, grams: 150 }, { ingredient_id: 2, grams: 200 }])
    expect(body.used_up).toEqual([2]) // unknown ids dropped
  })
})
