import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanSteps, StepsEditor } from './StepsEditor'

function Harness({ start }: { start: string[] }) {
  const [steps, setSteps] = useState(start)
  return <StepsEditor steps={steps} onChange={setSteps} />
}

describe('StepsEditor', () => {
  afterEach(() => vi.restoreAllMocks())

  it('grows each step to fit its text, also while typing', () => {
    // jsdom has no layout: scrollHeight follows the text length
    vi.spyOn(HTMLTextAreaElement.prototype, 'scrollHeight', 'get').mockImplementation(function (this: HTMLTextAreaElement) {
      return 20 + this.value.length
    })
    render(<Harness start={['Boil water.', '']} />)
    expect(screen.getByLabelText('Step 1').style.height).toBe('31px')
    expect(screen.getByLabelText('Step 2').style.height).toBe('20px')
    fireEvent.change(screen.getByLabelText('Step 2'), { target: { value: 'x'.repeat(100) } })
    expect(screen.getByLabelText('Step 2').style.height).toBe('120px')
  })

  it('groups move and remove per step, with the edges disabled', () => {
    render(<Harness start={['A', 'B']} />)
    const group = screen.getByRole('group', { name: 'Step 1 actions' })
    expect(group).toContainElement(screen.getByLabelText('Move step 1 up'))
    expect(group).toContainElement(screen.getByLabelText('Remove step 1'))
    expect(screen.getByLabelText('Move step 1 up')).toBeDisabled()
    expect(screen.getByLabelText('Move step 2 down')).toBeDisabled()
    fireEvent.click(screen.getByLabelText('Move step 1 down'))
    expect(screen.getByLabelText('Step 1')).toHaveValue('B')
    fireEvent.click(screen.getByLabelText('Remove step 1'))
    expect(screen.getByLabelText('Step 1')).toHaveValue('A')
    expect(screen.getByLabelText('Remove step 1')).toBeDisabled() // the last one stays
  })

  it('adds a step and drops empty ones on save', () => {
    render(<Harness start={['A']} />)
    fireEvent.click(screen.getByText('+ Add step'))
    expect(screen.getByLabelText('Step 2')).toHaveValue('')
    expect(cleanSteps(['  A ', '', '   '])).toEqual(['A'])
  })
})
