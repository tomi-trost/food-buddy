import { act, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Sheet } from './Sheet'
import { Stars } from './Stars'
import { Stepper } from './Stepper'
import { TOAST_MS, ToastProvider, useToast } from './Toast'

function StepperHarness({ start = 2 }: { start?: number }) {
  const [v, setV] = useState(start)
  return <Stepper label="portions" value={v} onChange={setV} min={1} max={3} />
}

describe('Stepper', () => {
  it('steps within bounds and disables at the edges', () => {
    render(<StepperHarness />)
    fireEvent.click(screen.getByLabelText('More portions'))
    expect(screen.getByRole('group', { name: 'portions' })).toHaveTextContent('3')
    expect(screen.getByLabelText('More portions')).toBeDisabled()
    fireEvent.click(screen.getByLabelText('Less portions'))
    fireEvent.click(screen.getByLabelText('Less portions'))
    expect(screen.getByRole('group', { name: 'portions' })).toHaveTextContent('1')
    expect(screen.getByLabelText('Less portions')).toBeDisabled()
  })
})

describe('Stars', () => {
  it('reports half and whole stars', () => {
    const onChange = vi.fn()
    render(<Stars value={3} onChange={onChange} />)
    fireEvent.click(screen.getByLabelText('4.5 stars'))
    fireEvent.click(screen.getByLabelText('2 stars'))
    expect(onChange.mock.calls).toEqual([[4.5], [2]])
  })

  it('is read-only without onChange', () => {
    render(<Stars value={3.5} />)
    expect(screen.getByRole('img', { name: '3.5 of 5 stars' })).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})

describe('Sheet', () => {
  it('closes on Escape and backdrop tap, not on content tap', () => {
    const onClose = vi.fn()
    render(<Sheet open onClose={onClose} label="Test"><p>content</p></Sheet>)
    fireEvent.click(screen.getByText('content'))
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.click(document.querySelector('.sheetbg')!)
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})

function ToastButton({ undo }: { undo?: () => void }) {
  const toast = useToast()
  return <button onClick={() => toast('Saved', { undo })}>go</button>
}

describe('Toast', () => {
  it('runs undo and disappears', () => {
    const undo = vi.fn()
    render(<ToastProvider><ToastButton undo={undo} /></ToastProvider>)
    fireEvent.click(screen.getByText('go'))
    fireEvent.click(screen.getByText('Undo'))
    expect(undo).toHaveBeenCalledOnce()
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()
  })

  it('hides itself after a few seconds', () => {
    vi.useFakeTimers()
    render(<ToastProvider><ToastButton /></ToastProvider>)
    fireEvent.click(screen.getByText('go'))
    expect(screen.getByRole('status')).toHaveTextContent('Saved')
    act(() => vi.advanceTimersByTime(TOAST_MS + 10))
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()
    vi.useRealTimers()
  })
})
