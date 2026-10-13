import { useState } from 'react'

/** −/+ for quick changes; tap the number to type an exact value (applied on Enter or leaving the
 *  field, clamped to min/max; anything unreadable puts the old value back). */
export function Stepper({ value, onChange, step = 1, min = -Infinity, max = Infinity, unit = '', label, decimals }: {
  value: number
  onChange: (v: number) => void
  step?: number
  min?: number
  max?: number
  unit?: string
  label: string
  decimals?: number // typed values; default: whole numbers unless the step has a fraction
}) {
  const places = decimals ?? (Number.isInteger(step) ? 0 : 2)
  const clamp = (v: number, f = 100) => Math.min(max, Math.max(min, Math.round(v * f) / f))
  const [draft, setDraft] = useState<string | null>(null)

  const commit = () => {
    if (draft === null) return
    const n = Number(draft.trim().replace(',', '.'))
    if (draft.trim() !== '' && Number.isFinite(n)) {
      const v = clamp(n, 10 ** places)
      if (v !== value) onChange(v)
    }
    setDraft(null)
  }

  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" aria-label={`Less ${label}`} disabled={value <= min} onClick={() => onChange(clamp(value - step))}>
        −
      </button>
      <label className="stepper-value">
        <input
          aria-label={label}
          inputMode={places ? 'decimal' : 'numeric'}
          enterKeyHint="done"
          value={draft ?? String(value)}
          size={Math.max(String(draft ?? value).length, 2)}
          onFocus={(e) => {
            setDraft(String(value))
            e.currentTarget.select()
          }}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
        {unit.trim() && <span>{unit.trim()}</span>}
      </label>
      <button type="button" aria-label={`More ${label}`} disabled={value >= max} onClick={() => onChange(clamp(value + step))}>
        +
      </button>
    </div>
  )
}
