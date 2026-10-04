import { describe, expect, it } from 'vitest'
import { cellLabel, dayLabel, defaultWizard, nextOption, weekStart } from './plan'

describe('wizard cells', () => {
  it('cycles cook times → prep → out → skip → back', () => {
    let cell = { mode: 'cook' as const, minutes: 15 }
    const seen = []
    for (let i = 0; i < 7; i++) {
      seen.push(cellLabel(cell))
      cell = nextOption(cell) as typeof cell
    }
    expect(seen).toEqual(['15m', '30m', '45m', '60m+', 'Prep', 'Out', '–'])
    expect(cellLabel(cell)).toBe('15m')
  })

  it('starts from the mock pattern and returns fresh copies', () => {
    const a = defaultWizard()
    expect(a).toHaveLength(7)
    expect(a[4][2].mode).toBe('out')
    a[0][0].minutes = 99
    expect(defaultWizard()[0][0].minutes).toBe(15)
  })
})

describe('weekStart', () => {
  it('finds this and next Monday', () => {
    expect(weekStart('2026-10-04', 'this')).toBe('2026-09-28') // Sunday
    expect(weekStart('2026-10-04', 'next')).toBe('2026-10-05')
    expect(weekStart('2026-10-05', 'this')).toBe('2026-10-05') // Monday itself
    expect(weekStart('2026-12-30', 'next')).toBe('2027-01-04')
    expect(dayLabel('2026-10-05', 0)).toBe('Mon 5')
  })
})
