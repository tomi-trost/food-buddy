import { useEffect, useState } from 'react'

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** false on the first frame, then true: lets CSS transitions grow bars/rings from empty (mock animateIn). */
export function useEntered(): boolean {
  const [entered, setEntered] = useState(reducedMotion)
  useEffect(() => {
    if (entered) return
    const t = setTimeout(() => setEntered(true), 30)
    return () => clearTimeout(t)
  }, [entered])
  return entered
}

export function useCountUp(target: number, ms = 1000): number {
  const [value, setValue] = useState(() => (reducedMotion() ? target : 0))
  useEffect(() => {
    if (reducedMotion()) {
      setValue(target)
      return
    }
    const t0 = performance.now()
    let frame = 0
    const step = (t: number) => {
      const p = Math.min((t - t0) / ms, 1)
      setValue(target * (1 - Math.pow(1 - p, 3)))
      if (p < 1) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [target, ms])
  return value
}

export function Ring({ value, goal, size = 112 }: { value: number; goal: number; size?: number }) {
  const entered = useEntered()
  const shown = useCountUp(value)
  const r = size / 2 - 9
  const c = 2 * Math.PI * r
  const pct = goal > 0 ? Math.min(value / goal, 1) : 0
  return (
    <svg width={size} height={size} role="img" aria-label={`${Math.round(value)} of ${goal} kcal`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface2)" strokeWidth={10} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--accent)" strokeWidth={10}
        strokeDasharray={`${entered ? c * pct : 0} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dasharray 1s cubic-bezier(.2,.8,.2,1)' }} />
      <text x="50%" y="48%" textAnchor="middle" style={{ fontSize: 22, fontWeight: 650, fill: 'var(--ink)' }}>{Math.round(shown)}</text>
      <text x="50%" y="64%" textAnchor="middle">/ {goal} kcal</text>
    </svg>
  )
}

export function ProgressBar({ pct, color, delay = 0 }: { pct: number; color: string; delay?: number }) {
  const entered = useEntered()
  return (
    <div className="bar">
      <i style={{ width: `${entered ? Math.min(Math.max(pct, 0), 100) : 0}%`, background: color, transition: `width .9s cubic-bezier(.2,.8,.2,1) ${delay}ms` }} />
    </div>
  )
}

type Bar = { label: string; value: number; highlight?: boolean; title: string }

/** Path for a bar with 4 px rounded data-end, square at the baseline. */
function barPath(x: number, y: number, w: number, h: number) {
  const r = Math.min(4, w / 2, h)
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`
}

export function BarChart({ bars, goal, goalLabel, color, label, height = 140 }: {
  bars: Bar[]
  goal?: number
  goalLabel?: string
  color: string
  label: string
  height?: number
}) {
  const W = 330
  const max = Math.max(goal ? goal * 1.2 : 0, ...bars.map((b) => b.value), 1)
  const slot = W / bars.length
  const bw = Math.min(slot - 8, 40)
  const gy = goal ? height - (goal / max) * height : 0
  return (
    <>
      <svg viewBox={`0 0 ${W} ${height + 18}`} width="100%" style={{ marginTop: 8 }} aria-hidden="true">
        {bars.map((b, i) => {
          const h = Math.max((b.value / max) * height, b.value > 0 ? 2 : 0)
          const x = i * slot + (slot - bw) / 2
          return (
            <g key={i}>
              <title>{b.title}</title>
              {/* generous hover target over the whole column */}
              <rect x={i * slot} y={0} width={slot} height={height} fill="transparent" />
              {h > 0 && <path d={barPath(x, height - h, bw, h)} fill={b.highlight ? color : 'var(--line2)'} />}
              <text x={x + bw / 2} y={height + 14} textAnchor="middle">{b.label}</text>
            </g>
          )
        })}
        {goal ? (
          <>
            <line x1={0} x2={W} y1={gy} y2={gy} stroke="var(--ink2)" strokeDasharray="4 4" />
            {goalLabel && <text x={W} y={gy - 4} textAnchor="end">{goalLabel}</text>}
          </>
        ) : null}
      </svg>
      <table className="visually-hidden" aria-label={label}>
        <tbody>{bars.map((b, i) => <tr key={i}><td>{b.title}</td></tr>)}</tbody>
      </table>
    </>
  )
}

/** Donut with a 2 px surface gap between segments. Identity is carried by the legend next to it. */
export function Donut({ segments, size = 120 }: { segments: { value: number; color: string }[]; size?: number }) {
  const r = 46
  const c = 2 * Math.PI * r
  const total = segments.reduce((a, s) => a + s.value, 0) || 1
  let offset = 0
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" aria-hidden="true">
      {segments.map((s, i) => {
        const len = (s.value / total) * c
        const gap = segments.length > 1 ? Math.min(2, len / 2) : 0
        const el = (
          <circle key={i} cx={60} cy={60} r={r} fill="none" stroke={s.color} strokeWidth={18}
            strokeDasharray={`${Math.max(len - gap, 0)} ${c}`} strokeDashoffset={-offset} transform="rotate(-90 60 60)" />
        )
        offset += len
        return el
      })}
    </svg>
  )
}
