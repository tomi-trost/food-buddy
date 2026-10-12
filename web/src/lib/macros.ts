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

/** Same limits as the API's NutrientsIn (per 100 g or per piece). */
export const NUTRIENT_MAX: Nutrients = { kcal: 5000, protein: 500, carbs: 500, fat: 500, fiber: 200, sugar: 500 }

/** A typed value: "7,6" (Italian keyboard) and "7.6" both work; empty, negative or too big → null. */
export function parseNutrient(key: keyof Nutrients, text: string): number | null {
  const t = text.trim().replace(',', '.')
  if (!/^\d*\.?\d+$|^\d+\.$/.test(t)) return null
  const n = Number(t)
  return n <= NUTRIENT_MAX[key] ? n : null
}
