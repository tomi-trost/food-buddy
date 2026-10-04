// Mirrors the FastAPI response models (api/app/**/schemas). TODO(M4): generate from /api/openapi.json.

export type Nutrients = {
  kcal: number
  protein: number
  carbs: number
  fat: number
  fiber: number
  sugar: number
}

export type Ingredient = {
  id: number
  name: string
  emoji: string
  category: string
  location: 'fridge' | 'pantry'
  price_per_100g: number
  per100: Nutrients
}

export type MealType = 'breakfast' | 'lunch' | 'dinner'

export type AnalysisItem = {
  name: string
  grams: number
  confidence: number
  ingredient: (Ingredient & { score: number }) | null
  nutrients: Nutrients | null
}

export type Fill = 'hungry' | 'right' | 'heavy'

export type Rating = {
  taste: number // 0.5–5 in half steps
  again: 1 | 3 | 5
  effort: 1 | 3 | 5
  fill: Fill
  note?: string | null
}

export type MealStats = { score: number | null; cooked_count: number; last_cooked: string | null }

export type MealCard = MealStats & {
  id: number
  name: string
  emoji: string
  photo_url: string | null
  types: MealType[]
  tags: string[]
  prep_minutes: number
  portions: number
  cost: number
  rated_by_me: boolean
  kcal_per_portion: number
  created_at: string
}

export type Meal = MealStats & {
  id: number
  name: string
  emoji: string
  photo_url: string | null
  types: MealType[]
  tags: string[]
  prep_minutes: number
  portions: number
  cost: number
  cost_estimated: boolean
  steps: string[]
  steps_source: 'template' | 'model'
  ingredients: { ingredient: Ingredient; grams: number }[]
  per_portion: Nutrients
  ratings: { user_id: number; name: string; color: string; rating: Rating | null }[]
  created_at: string
}

export type CookIn = { meal_type: MealType; eaten_on: string; used_up: number[] }

export type MealCreate = {
  name: string
  meal_type: MealType
  eaten_on: string
  prep_minutes: number
  portions: number
  servings_eaten: number
  cost: number | null
  items: { ingredient_id: number; grams: number }[]
  used_up: number[]
  analysis_id: number | null
}

export type AnalysisResult = {
  dish: string
  meal_type: 'breakfast' | 'lunch' | 'dinner' | 'snack'
  servings: number
  items: AnalysisItem[]
  totals: Nutrients
  unmatched: number
}

export type AnalysisJob = {
  id: number
  status: 'queued' | 'running' | 'done' | 'failed'
  photo_url: string
  provider: string | null
  result: AnalysisResult | null
  error: string | null
  created_at: string
  finished_at: string | null
}

export type Member = { id: number; name: string; color: string }

export type Goals = { kcal: number; protein: number; fiber: number; sugar: number }

export type Me = {
  id: number
  email: string
  name: string
  color: string
  goals: Goals
  household: {
    id: number
    name: string
    invite_code: string
    reward_per: number
    reward_cap: number
    members: Member[]
  }
}

export type MePatch = Partial<{
  name: string
  goal_kcal: number
  goal_protein: number
  goal_fiber: number
  goal_sugar: number
}>

export type HouseholdPatch = Partial<{ name: string; reward_per: number; reward_cap: number }>

export type RegisterBody = {
  email: string
  password: string
  name: string
  household_name?: string
  invite_code?: string
}

export type StockItem = { ingredient: Ingredient; grams: number; expires_on: string; days_left: number }
