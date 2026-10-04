import type { AnalysisJob, Ingredient, Me, Meal, MealCard, Nutrients, Plan, Shopping } from '../api/types'

export const me = (over: Partial<Me> = {}): Me => ({
  id: 1,
  email: 'tomi@example.com',
  name: 'Tomi',
  color: '#b9532f',
  goals: { kcal: 2200, protein: 110, fiber: 30, sugar: 50 },
  household: {
    id: 1,
    name: 'Home',
    invite_code: 'inv123',
    reward_per: 2,
    reward_cap: 3,
    members: [
      { id: 1, name: 'Tomi', color: '#b9532f' },
      { id: 2, name: 'Partner', color: '#5d8582' },
    ],
  },
  ...over,
})


const n = (kcal: number, protein: number, carbs: number, fat: number, fiber = 0, sugar = 0): Nutrients =>
  ({ kcal, protein, carbs, fat, fiber, sugar })

export const ING: Record<string, Ingredient> = {
  chicken: { id: 1, name: 'Chicken breast', emoji: '🍗', category: 'Meat', location: 'fridge', price_per_100g: 0.9, per100: n(165, 31, 0, 3.6) },
  rice: { id: 2, name: 'Rice (cooked)', emoji: '🍚', category: 'Pantry', location: 'pantry', price_per_100g: 0.2, per100: n(130, 2.7, 28, 0.3, 0.4) },
  soy: { id: 4, name: 'Soy sauce', emoji: '🫙', category: 'Pantry', location: 'pantry', price_per_100g: 0.5, per100: n(60, 8, 5, 0, 0.8, 0.5) },
  oil: { id: 5, name: 'Olive oil', emoji: '🫒', category: 'Pantry', location: 'pantry', price_per_100g: 0.8, per100: n(884, 0, 0, 100) },
}

export const analysisJob = (over: Partial<AnalysisJob> = {}): AnalysisJob => ({
  id: 5, status: 'queued', photo_url: '/api/analyses/5/photo', provider: null, result: null,
  error: null, created_at: '2026-10-04T12:00:00Z', finished_at: null, ...over,
})

export const doneJob = () =>
  analysisJob({
    status: 'done',
    provider: 'local',
    result: {
      dish: 'chicken rice bowl', meal_type: 'dinner', servings: 1, unmatched: 1,
      totals: n(507.5, 51.9, 56, 6, 0.8),
      items: [
        { name: 'grilled chicken', grams: 150, confidence: 0.9, nutrients: null, ingredient: { ...ING.chicken, score: 1 } },
        { name: 'cooked rice', grams: 200, confidence: 0.8, nutrients: null, ingredient: { ...ING.rice, score: 1 } },
        { name: 'mystery sauce', grams: 30, confidence: 0.2, ingredient: null, nutrients: null },
      ],
    },
  })

export const meal = (over: Partial<Meal> = {}): Meal => ({
  id: 3, name: 'Chicken rice bowl', emoji: '🍚', photo_url: null, types: ['lunch'], tags: ['quick'],
  prep_minutes: 20, portions: 2, cost: 3.58, cost_estimated: true, steps: ['Cook rice.', 'Serve.'],
  steps_source: 'template', created_at: '2026-10-01T12:00:00Z',
  per_portion: n(551.7, 51.9, 56, 9.9, 0.8, 0),
  ingredients: [{ ingredient: ING.rice, grams: 400 }, { ingredient: ING.chicken, grams: 300 }],
  score: null, cooked_count: 1, last_cooked: '2026-10-01',
  ratings: [
    { user_id: 1, name: 'Tomi', color: '#b9532f', rating: null },
    { user_id: 2, name: 'Partner', color: '#5d8582', rating: { taste: 4.5, again: 5, effort: 3, fill: 'hungry' } },
  ],
  ...over,
})

export const card = (over: Partial<MealCard> = {}): MealCard => ({
  id: 1, name: 'Meal', emoji: '🍽️', photo_url: null, types: ['dinner'], tags: [], prep_minutes: 30,
  portions: 2, cost: 6, rated_by_me: false, kcal_per_portion: 500, created_at: '2026-10-01T12:00:00Z',
  score: null, cooked_count: 1, last_cooked: '2026-10-01', ...over,
})

const slotCard = (id: number, name: string, emoji: string, over: Partial<MealCard> = {}) =>
  card({ id, name, emoji, ...over })

export const plan = (over: Partial<Plan> = {}): Plan => {
  const toast = slotCard(1, 'Avocado egg toast', '🥑', { types: ['breakfast'], prep_minutes: 10, score: 4.5 })
  const bowl = slotCard(2, 'Chicken rice bowl', '🍚', { types: ['lunch'], prep_minutes: 20, score: 4 })
  const stirfry = slotCard(3, 'Chicken stir-fry', '🍗', { types: ['dinner'], prep_minutes: 25, score: 4.8 })
  return {
    id: 1, week_start: '2026-10-05', status: 'draft',
    wizard: Array.from({ length: 7 }, () => [
      { mode: 'cook', minutes: 15 }, { mode: 'prep', minutes: null }, { mode: 'cook', minutes: 30 },
    ]),
    days: Array.from({ length: 7 }, (_, i) => ({
      date: `2026-10-${String(5 + i).padStart(2, '0')}`,
      kcal: 1500,
      slots: [
        { meal_type: 'breakfast', mode: 'cook', minutes: 15, meal: toast },
        { meal_type: 'lunch', mode: 'prep', minutes: null, meal: bowl },
        i === 4
          ? { meal_type: 'dinner', mode: 'out', minutes: null, meal: null }
          : { meal_type: 'dinner', mode: 'cook', minutes: 30, meal: stirfry },
      ],
    })),
    approvals: [
      { user_id: 1, name: 'Tomi', color: '#b9532f', approved: false },
      { user_id: 2, name: 'Partner', color: '#5d8582', approved: true },
    ],
    summary: { cook: 13, prep: 7, out: 1, skip: 0, grocery_cost: 42.5, batch_cook: [{ meal_id: 2, name: 'Chicken rice bowl', times: 7 }] },
    ...over,
  }
}

export const shopping = (over: Partial<Shopping> = {}): Shopping => ({
  plan_approved: true,
  total: 4.1,
  in_stock: [ING.oil],
  items: [
    { ingredient: ING.soy, need: 0, have: 0, buy: 250, ran_out: true, checked: false },
    { ingredient: ING.chicken, need: 1200, have: 400, buy: 800, ran_out: false, checked: true },
    { ingredient: ING.rice, need: 600, have: 0, buy: 600, ran_out: false, checked: false },
  ],
  ...over,
})
