// Mirrors the FastAPI response models (api/app/**/schemas). TODO(M4): generate from /api/openapi.json.

export type Nutrients = {
  kcal: number
  protein: number
  carbs: number
  fat: number
  fiber: number
  sugar: number
}

export type AnalysisItem = {
  name: string
  grams: number
  confidence: number
  ingredient: { id: number; name: string; per100: Nutrients; score: number } | null
  nutrients: Nutrients | null
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

export type Me = {
  id: number
  email: string
  name: string
  household: { id: number; name: string; invite_code: string }
}

export type RegisterBody = {
  email: string
  password: string
  name: string
  household_name?: string
  invite_code?: string
}
