import { type ReactNode, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

export const CLOSE_DRAG_PX = 80 // pull at least this far down…
const FLICK_PX_PER_MS = 0.5 // …or flick faster than this

let locks = 0 // open sheets; the page behind doesn't scroll while any is open

function lockPage() {
  if (locks++ === 0) document.documentElement.classList.add('sheet-open')
  return () => {
    if (--locks === 0) document.documentElement.classList.remove('sheet-open')
  }
}

/** Bottom sheet. Closes on backdrop tap, Escape, or a swipe down from its top. */
export function Sheet({ open, onClose, label, children }: {
  open: boolean
  onClose: () => void
  label: string
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useEffect(() => (open ? lockPage() : undefined), [open])

  // Touch events, not pointer events: iOS cancels pointer events once it starts scrolling.
  useEffect(() => {
    const sheet = ref.current
    if (!open || !sheet) return
    let startY = 0
    let startT = 0
    let dy = 0
    let dragging = false
    const move = (y: number) => {
      sheet.style.transition = 'none'
      sheet.style.transform = `translateY(${y}px)`
    }
    const onStart = (e: TouchEvent) => {
      startY = e.touches[0].clientY
      startT = performance.now()
      dy = 0
      dragging = false
    }
    const onMove = (e: TouchEvent) => {
      dy = e.touches[0].clientY - startY
      // only a pull down while the content is at its top drags the sheet; anything else scrolls it
      if (!dragging && dy > 0 && sheet.scrollTop <= 0) dragging = true
      if (!dragging) return
      e.preventDefault()
      move(Math.max(0, dy))
    }
    const onEnd = () => {
      if (!dragging) return
      dragging = false
      const fast = dy / Math.max(1, performance.now() - startT) > FLICK_PX_PER_MS
      sheet.style.transition = ''
      sheet.style.transform = ''
      if (dy > CLOSE_DRAG_PX || (fast && dy > 20)) closeRef.current()
    }
    sheet.addEventListener('touchstart', onStart, { passive: true })
    sheet.addEventListener('touchmove', onMove, { passive: false })
    sheet.addEventListener('touchend', onEnd)
    sheet.addEventListener('touchcancel', onEnd)
    return () => {
      sheet.removeEventListener('touchstart', onStart)
      sheet.removeEventListener('touchmove', onMove)
      sheet.removeEventListener('touchend', onEnd)
      sheet.removeEventListener('touchcancel', onEnd)
    }
  }, [open])

  if (!open) return null
  return createPortal(
    <div className="sheetbg" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className="sheet" role="dialog" aria-modal="true" aria-label={label}>
        <div className="grab" />
        {children}
      </div>
    </div>,
    document.body,
  )
}
