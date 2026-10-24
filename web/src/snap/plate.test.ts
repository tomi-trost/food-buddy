import { describe, expect, it } from 'vitest'
import { doneJob, ING } from '../test/fixtures'
import { addIngredient, byWeight, fromAnalysis, plateNutrients, recipeCost, replaceIngredient, snackCount, toMealCreate, unresolved } from './plate'

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
      items: items(), name: '  Bowl ', mealType: 'dinner', eaten: true, eatenOn: '2026-10-04', prepMinutes: 20,
      portions: 2, servingsEaten: 1, cost: null, usedUp: [2, 99], analysisId: 5,
    })
    expect(body.name).toBe('Bowl')
    expect(body.items).toEqual([{ ingredient_id: 1, grams: 150 }, { ingredient_id: 2, grams: 200 }])
    expect(body.used_up).toEqual([2]) // unknown ids dropped
    expect(body).toMatchObject({ eaten: true, eaten_on: '2026-10-04' })
  })

  it('sends bought / eaten-out food as one plate with what we paid, nothing used up', () => {
    const body = toMealCreate({
      items: items(), name: 'Pizza', mealType: 'dinner', eaten: false, eatenOn: '2026-10-04', prepMinutes: 20,
      portions: 4, servingsEaten: 1, cost: 12, usedUp: [2], analysisId: 5, origin: 'out', place: '  Rosa ',
    })
    expect(body).toMatchObject({ origin: 'out', place: 'Rosa', portions: 1, used_up: [], eaten: true, eaten_on: '2026-10-04', cost: 12 })
    expect(toMealCreate({ items: items(), name: 'x', mealType: 'lunch', eaten: true, eatenOn: '2026-10-04',
      prepMinutes: 5, portions: 1, servingsEaten: 1, cost: null, usedUp: [], analysisId: null, origin: 'bought', place: ' ' }).place).toBeNull()
  })

  it('saves for later without a date or used-up ingredients', () => {
    const body = toMealCreate({
      items: items(), name: 'Bowl', mealType: 'lunch', eaten: false, eatenOn: '2026-10-04', prepMinutes: 20,
      portions: 2, servingsEaten: 1, cost: null, usedUp: [2], analysisId: 5,
    })
    expect(body).toMatchObject({ eaten: false, eaten_on: null, used_up: [] })
  })
})

describe('snackCount', () => {
  const item = (ingredient: (typeof ING)[string], grams = 50) => ({ key: String(ingredient.id), name: ingredient.name, grams, ingredient })
  const cookie = { ...ING.chicken, id: 30, name: 'Cookies', unit: 'pc' as const, unit_grams: 12 }

  it('counts one countable thing in pieces, one liquid in ml, anything mixed in portions', () => {
    expect(snackCount([item(cookie)])).toEqual({ per: 'piece', pieceG: 12 })
    expect(snackCount([item(ING.oil)])).toEqual({ per: '100ml', pieceG: 100 })
    expect(snackCount([item(ING.rice), item(cookie)])).toEqual({ per: 'portion', pieceG: 100 })
    expect(snackCount([])).toEqual({ per: 'portion', pieceG: 100 })
  })

  it('sends snack fields only for snacks', () => {
    const base = { items: [item(cookie)], name: 'Cookies', eaten: true, eatenOn: '2026-10-14', prepMinutes: 1, portions: 1,
      servingsEaten: 1, cost: null, usedUp: [], analysisId: null, snack: { kind: 'sweet' as const, per: 'piece' as const, pieceG: 12 } }
    expect(toMealCreate({ ...base, mealType: 'snack' })).toMatchObject({ meal_type: 'snack', snack_kind: 'sweet', per: 'piece', piece_g: 12 })
    expect(toMealCreate({ ...base, mealType: 'lunch' })).not.toHaveProperty('snack_kind')
  })
})
