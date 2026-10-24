import type { MealKind } from '../api/types'
import { MEAL_TYPE_LABEL } from '../lib/dates'
import { Icon, type IconName } from './Icon'

export const MEAL_TYPE_ICON: Record<MealKind | 'later', IconName> = {
  breakfast: 'sunrise', lunch: 'sun', dinner: 'moon', snack: 'gift', later: 'clock',
}

/** An icon above the label, for a stacked meal-type switch (`<Toggle stack>`). */
export function typeOption<T extends MealKind | 'later'>(value: T, label: string = value === 'later' ? 'For later' : MEAL_TYPE_LABEL[value as MealKind]) {
  return { value, label: <><Icon name={MEAL_TYPE_ICON[value]} size={18} /><span>{label}</span></> }
}
