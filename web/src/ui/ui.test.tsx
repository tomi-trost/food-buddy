import { act, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Sheet } from './Sheet'
import { starAt, Stars } from './Stars'
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

  it('maps a point on the row to half stars, clamped to 0.5–5', () => {
    // 32 px stars, 2 px gaps: star 1 spans 0–32, star 2 spans 34–66
    expect(starAt(0, 32)).toBe(0.5)
    expect(starAt(16, 32)).toBe(0.5)
    expect(starAt(17, 32)).toBe(1)
    expect(starAt(33, 32)).toBe(1) // the gap counts as the star before it
    expect(starAt(40, 32)).toBe(1.5)
    expect(starAt(60, 32)).toBe(2)
    expect(starAt(-20, 32)).toBe(0.5)
    expect(starAt(500, 32)).toBe(5)
  })

  it('follows a drag along the row and stops on release', () => {
    function Harness() {
      const [v, setV] = useState(1)
      return <Stars value={v} onChange={setV} />
    }
    render(<Harness />)
    const row = screen.getByRole('group')
    row.getBoundingClientRect = () => ({ left: 100 }) as DOMRect
    fireEvent.pointerDown(row, { clientX: 110, pointerId: 1 })
    expect(row).toHaveAccessibleName('0.5 of 5 stars')
    fireEvent.pointerMove(row, { clientX: 100 + 34 * 3 + 20, pointerId: 1 })
    expect(row).toHaveAccessibleName('4 of 5 stars')
    fireEvent.pointerMove(row, { clientX: 900, pointerId: 1 })
    expect(row).toHaveAccessibleName('5 of 5 stars')
    fireEvent.pointerUp(row, { pointerId: 1 })
    fireEvent.pointerMove(row, { clientX: 110, pointerId: 1 })
    expect(row).toHaveAccessibleName('5 of 5 stars')
  })

  it('reports a tap once, not again for the click that follows', () => {
    const changes: number[] = []
    function Harness() {
      const [v, setV] = useState(3)
      return <Stars value={v} onChange={(x) => { changes.push(x); setV(x) }} />
    }
    render(<Harness />)
    const row = screen.getByRole('group')
    row.getBoundingClientRect = () => ({ left: 0 }) as DOMRect
    fireEvent.pointerDown(row, { clientX: 160, pointerId: 1 }) // right half of star 5 (136–168 px)
    fireEvent.pointerUp(row, { pointerId: 1 })
    fireEvent.click(screen.getByLabelText('5 stars'))
    expect(changes).toEqual([5])
  })

  it('is read-only without onChange', () => {
    render(<Stars value={3.5} />)
    expect(screen.getByRole('img', { name: '3.5 of 5 stars' })).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})

let now = 0

/** Touch at ys[0], move through the rest, lift `ms` later. */
function swipe(el: Element, ys: number[], ms = 400) {
  fireEvent.touchStart(el, { touches: [{ clientY: ys[0] }] })
  ys.slice(1).forEach((y) => fireEvent.touchMove(el, { touches: [{ clientY: y }] }))
  now += ms
  fireEvent.touchEnd(el, { touches: [] })
}

describe('Sheet swipe', () => {
  beforeEach(() => {
    now = 0
    vi.spyOn(performance, 'now').mockImplementation(() => now)
  })
  afterEach(() => vi.restoreAllMocks())

  it('closes on a swipe down from the top', () => {
    const onClose = vi.fn()
    render(<Sheet open onClose={onClose} label="Test"><p>content</p></Sheet>)
    swipe(screen.getByRole('dialog'), [100, 150, 220])
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('follows the finger and snaps back after a short slow pull', () => {
    const onClose = vi.fn()
    render(<Sheet open onClose={onClose} label="Test"><p>content</p></Sheet>)
    const sheet = screen.getByRole('dialog')
    fireEvent.touchStart(sheet, { touches: [{ clientY: 100 }] })
    fireEvent.touchMove(sheet, { touches: [{ clientY: 140 }] })
    expect(sheet.style.transform).toBe('translateY(40px)')
    now += 600
    fireEvent.touchEnd(sheet, { touches: [] })
    expect(sheet.style.transform).toBe('')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes on a quick flick even if short', () => {
    const onClose = vi.fn()
    render(<Sheet open onClose={onClose} label="Test"><p>content</p></Sheet>)
    swipe(screen.getByRole('dialog'), [100, 150], 50) // 50 px in 50 ms
    expect(onClose).toHaveBeenCalled()
  })

  it('scrolls its content instead when not at the top, and ignores swipes up', () => {
    const onClose = vi.fn()
    render(<Sheet open onClose={onClose} label="Test"><p>content</p></Sheet>)
    const sheet = screen.getByRole('dialog')
    sheet.scrollTop = 120
    swipe(sheet, [100, 200, 300])
    expect(sheet.style.transform).toBe('')
    sheet.scrollTop = 0
    swipe(sheet, [300, 100])
    expect(onClose).not.toHaveBeenCalled()
  })

  it('stays put when the drag starts on the rating stars', () => {
    const onClose = vi.fn()
    render(<Sheet open onClose={onClose} label="Test"><Stars value={3} onChange={() => {}} /></Sheet>)
    const stars = screen.getByRole('group', { name: '3 of 5 stars' })
    fireEvent.touchStart(stars, { touches: [{ clientY: 100 }] })
    fireEvent.touchMove(stars, { touches: [{ clientY: 200 }] })
    expect(screen.getByRole('dialog').style.transform).toBe('')
    fireEvent.touchEnd(stars, { touches: [] })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('locks the page behind while any sheet is open', () => {
    const html = document.documentElement
    const { rerender, unmount } = render(<>
      <Sheet open onClose={() => {}} label="A"><p>a</p></Sheet>
      <Sheet open onClose={() => {}} label="B"><p>b</p></Sheet>
    </>)
    expect(html).toHaveClass('sheet-open')
    rerender(<>
      <Sheet open={false} onClose={() => {}} label="A"><p>a</p></Sheet>
      <Sheet open onClose={() => {}} label="B"><p>b</p></Sheet>
    </>)
    expect(html).toHaveClass('sheet-open') // B is still open
    unmount()
    expect(html).not.toHaveClass('sheet-open')
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
