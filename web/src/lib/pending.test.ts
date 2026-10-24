import { describe, expect, it } from 'vitest'
import { analysisJob, doneJob } from '../test/fixtures'
import { banner, jobHref } from './pending'

const ME = 1
const ana = { id: 2, name: 'Ana' }

describe('snack meals', () => {
  it('call a snack photo a snack, and open the check screen', () => {
    const job = analysisJob({ id: 4, kind: 'meal', meal_type: 'snack', status: 'running' })
    const shown = banner([job], ME)!
    expect(shown.title).toMatch(/your snack/)
    expect(shown.href).toBe('/analysis/4')
  })
})

describe('banner', () => {
  it('is empty without open photos', () => {
    expect(banner([], ME)).toBeNull()
    expect(banner([analysisJob({ closed: true })], ME)).toBeNull()
  })

  it('invites rating while my meal is analyzing, until I have rated', () => {
    const b = banner([analysisJob({ status: 'running' })], ME)!
    expect(b).toMatchObject({ title: 'Analyzing your meal…', action: 'Rate it', href: '/analysis/5', busy: true, more: 0 })
    const rated = analysisJob({ my_rating: { taste: 4, again: 5, effort: 0, fill: 0 } })
    expect(banner([rated], ME)!.action).toBe('Open')
  })

  it("names the partner's photo", () => {
    expect(banner([analysisJob({ by: ana })], ME)!.title).toBe("Analyzing Ana's meal…")
  })

  it('shows a ready meal before older ones still analyzing, and counts the rest', () => {
    const older = analysisJob({ id: 1, status: 'running' })
    const ready = { ...doneJob(), id: 2 }
    const b = banner([older, ready], ME)!
    expect(b).toMatchObject({ title: 'Chicken rice bowl is ready to check', action: 'Review', busy: false, more: 1 })
    expect(b.job.id).toBe(2)
  })

  it('puts failed photos between ready and analyzing', () => {
    const failed = analysisJob({ id: 3, status: 'failed', kind: 'snack' })
    expect(banner([analysisJob({ id: 1 }), failed], ME)).toMatchObject({ title: "Couldn't analyze your snack", action: 'Open' })
  })

  it('sends snacks and labels to the snack screen', () => {
    const snack = analysisJob({
      kind: 'snack', status: 'done',
      snack: { name: 'cookie', kind: 'sweet', per: 'piece', amount: 1, per_unit: { kcal: 80, protein: 1, carbs: 10, fat: 4, fiber: 0, sugar: 6 } },
    })
    expect(banner([snack], ME)).toMatchObject({ title: 'Cookie is ready to log', action: 'Log it', href: '/snack/5' })
    expect(banner([analysisJob({ kind: 'label' })], ME)).toMatchObject({ title: 'Reading your label…', action: 'Open' })
    expect(jobHref(analysisJob({ kind: 'label' }))).toBe('/snack/5')
  })

  it('falls back to a generic name when the model gave none', () => {
    const noName = analysisJob({ status: 'done', result: null, by: ana })
    expect(banner([noName], ME)!.title).toBe("Ana's meal is ready to check")
  })
})
