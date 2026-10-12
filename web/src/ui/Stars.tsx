import { useRef } from 'react'
import { Icon } from './Icon'

const GAP = 2

/** Rating under a point `x` px from the left edge of the row: half-star steps, 0.5–5. */
export function starAt(x: number, size: number, gap = GAP): number {
  const i = Math.floor(x / (size + gap))
  const rest = x - i * (size + gap)
  return Math.min(5, Math.max(0.5, i + (rest <= size / 2 ? 0.5 : 1)))
}

/** Half-star rating (0.5–5). Tap a half, or press and slide along the row. Read-only without onChange. */
export function Stars({ value, onChange, size = 32 }: { value: number; onChange?: (v: number) => void; size?: number }) {
  const dragging = useRef(false)
  const set = (v: number) => {
    if (onChange && v !== value) onChange(v)
  }
  const fromPointer = (e: React.PointerEvent<HTMLSpanElement>) =>
    set(starAt(e.clientX - e.currentTarget.getBoundingClientRect().left, size))

  return (
    <span
      className={onChange ? 'stars edit' : 'stars'}
      style={{ display: 'inline-flex', gap: GAP }}
      role={onChange ? 'group' : 'img'}
      aria-label={`${value} of 5 stars`}
      {...(onChange && {
        onPointerDown: (e: React.PointerEvent<HTMLSpanElement>) => {
          dragging.current = true
          e.currentTarget.setPointerCapture?.(e.pointerId)
          fromPointer(e)
        },
        onPointerMove: (e: React.PointerEvent<HTMLSpanElement>) => {
          if (dragging.current) fromPointer(e)
        },
        onPointerUp: () => (dragging.current = false),
        onPointerCancel: () => (dragging.current = false),
      })}
    >
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = value >= i ? 100 : value >= i - 0.5 ? 50 : 0
        return (
          <span key={i} className="starw" style={{ width: size, height: size }}>
            <span className="sb"><Icon name="star" size={size} /></span>
            <span className="sf" style={{ width: `${fill}%` }}><Icon name="star" size={size} fill /></span>
            {onChange && (
              <>
                <button type="button" className="hz l" aria-label={`${i - 0.5} stars`} onClick={() => set(i - 0.5)} />
                <button type="button" className="hz r" aria-label={`${i} stars`} onClick={() => set(i)} />
              </>
            )}
          </span>
        )
      })}
    </span>
  )
}

export function StarNum({ value }: { value: number }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
      <Icon name="star" size={13} fill />
      {Math.round(value * 10) / 10}
    </span>
  )
}
