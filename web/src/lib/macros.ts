import type { Nutrients } from '../api/types'

export const NUTRIENT_KEYS = ['kcal', 'protein', 'carbs', 'fat', 'fiber', 'sugar'] as const

export const ZERO: Nutrients = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0 }

/** Same math as the backend (api/app/nutrition/macros.py): per-100 g values × grams / 100. */
export function scale(per100: Nutrients, grams: number): Nutrients {
  const factor = Math.max(0, grams) / 100
  const out = { ...ZERO }
  for (const key of NUTRIENT_KEYS) out[key] = per100[key] * factor
  return out
}

export function sum(items: Nutrients[]): Nutrients {
  const out = { ...ZERO }
  for (const item of items) for (const key of NUTRIENT_KEYS) out[key] += item[key]
  return out
}
