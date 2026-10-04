import type { CSSProperties } from 'react'
import type { Nutrients } from '../api/types'
import { Icon, type IconName } from './Icon'

/** Icon + colour identity per nutrient (decision 0010). */
export const MAC: Record<keyof Nutrients, { name: string; icon: IconName; color: string; unit: string }> = {
  kcal: { name: 'kcal', icon: 'flame', color: 'var(--k)', unit: '' },
  protein: { name: 'protein', icon: 'dumbbell', color: 'var(--p)', unit: ' g' },
  carbs: { name: 'carbs', icon: 'wheat', color: 'var(--c)', unit: ' g' },
  fat: { name: 'fat', icon: 'drop', color: 'var(--f)', unit: ' g' },
  fiber: { name: 'fiber', icon: 'leaf', color: 'var(--fi)', unit: ' g' },
  sugar: { name: 'sugar', icon: 'cube', color: 'var(--sg)', unit: ' g' },
}

export const MACRO_ORDER: (keyof Nutrients)[] = ['kcal', 'protein', 'carbs', 'fat', 'fiber', 'sugar']

export function MacroTiles({ values, label = 'Nutrition' }: { values: Nutrients; label?: string }) {
  return (
    <div className="macro" style={{ '--n': 3 } as CSSProperties} aria-label={label}>
      {MACRO_ORDER.map((k) => (
        <div key={k} className="mt" style={{ '--mc': MAC[k].color } as CSSProperties}>
          <Icon name={MAC[k].icon} size={18} />
          <b data-testid={`macro-${k}`}>
            {Math.round(values[k])}
            {MAC[k].unit}
          </b>
          <small>{MAC[k].name}</small>
        </div>
      ))}
    </div>
  )
}
