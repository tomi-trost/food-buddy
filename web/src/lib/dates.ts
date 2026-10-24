/** The phone's local date as YYYY-MM-DD (the server never guesses time zones). */
export function todayISO(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** A YYYY-MM-DD date n days later (negative: earlier), by the calendar, not by hours. */
export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  return todayISO(new Date(y, m - 1, d + n))
}

/** Same rule as the mock: before 11 breakfast, before 16 lunch, else dinner. */
export function guessMealType(now = new Date()): 'breakfast' | 'lunch' | 'dinner' {
  const h = now.getHours()
  return h < 11 ? 'breakfast' : h < 16 ? 'lunch' : 'dinner'
}

export const MEAL_TYPE_LABEL = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' } as const
export const MEAL_TYPE_SHORT = { breakfast: 'Bfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' } as const
