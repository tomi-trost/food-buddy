import type { WizardCell } from '../api/types'

/** Wizard cell options, cycled by tapping (mock OPTS). */
export const OPTIONS: WizardCell[] = [
  { mode: 'cook', minutes: 15 },
  { mode: 'cook', minutes: 30 },
  { mode: 'cook', minutes: 45 },
  { mode: 'cook', minutes: 60 },
  { mode: 'prep', minutes: null },
  { mode: 'out', minutes: null },
  { mode: 'skip', minutes: null },
]

const same = (a: WizardCell, b: WizardCell) => a.mode === b.mode && (a.mode !== 'cook' || a.minutes === b.minutes)

export function nextOption(cell: WizardCell): WizardCell {
  const i = OPTIONS.findIndex((o) => same(o, cell))
  return OPTIONS[(i + 1) % OPTIONS.length]
}

export function cellLabel(cell: WizardCell): string {
  if (cell.mode === 'cook') return (cell.minutes ?? 0) >= 60 ? `${cell.minutes}m+` : `${cell.minutes}m`
  return { prep: 'Prep', out: 'Out', skip: '–' }[cell.mode]
}

/** The mock's starting pattern: quick breakfasts, prepped lunches, longer dinners, relaxed weekend. */
export function defaultWizard(): WizardCell[][] {
  const [c15, c30, c45, c60, prep, out] = OPTIONS
  const week: WizardCell[][] = [
    [c15, prep, c30], [c15, prep, c30], [c15, prep, c45], [c15, prep, c30], [c15, prep, out],
    [c30, c30, c60], [c30, c30, c60],
  ]
  return week.map((row) => row.map((c) => ({ ...c })))
}

export const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const parse = (s: string) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** Monday of the week containing `todayISO` ('this') or of the week after ('next'). */
export function weekStart(todayISO: string, which: 'this' | 'next'): string {
  const d = parse(todayISO)
  const sinceMonday = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - sinceMonday + (which === 'next' ? 7 : 0))
  return iso(d)
}

export const dayLabel = (dateISO: string, index: number) => `${DAY_NAMES[index]} ${parse(dateISO).getDate()}`
