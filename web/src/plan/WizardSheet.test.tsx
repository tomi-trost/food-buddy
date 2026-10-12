import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { defaultWizard } from '../lib/plan'
import { WizardSheet } from './WizardSheet'

const wrap = (initial: ReturnType<typeof defaultWizard>) => (
  <QueryClientProvider client={new QueryClient()}>
    <WizardSheet open onClose={() => {}} initial={initial} />
  </QueryClientProvider>
)

describe('WizardSheet', () => {
  it('keeps my edits when the plan is refetched while the sheet is open', () => {
    const { rerender } = render(wrap(defaultWizard()))
    const monday = screen.getByRole('button', { name: /^Mon breakfast/ })
    const before = monday.textContent
    fireEvent.click(monday)
    const edited = screen.getByRole('button', { name: /^Mon breakfast/ }).textContent
    expect(edited).not.toBe(before)

    rerender(wrap(defaultWizard())) // same plan, new array from a refetch
    expect(screen.getByRole('button', { name: /^Mon breakfast/ })).toHaveTextContent(edited!)
  })
})
