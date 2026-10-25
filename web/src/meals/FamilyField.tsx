import { useState } from 'react'

/** Families that start with what's typed first, then ones that contain it; all of them when empty. */
export function familyOptions(families: string[], typed: string): string[] {
  const q = typed.trim().toLowerCase()
  const others = families.filter((f) => f.toLowerCase() !== q)
  if (!q) return others
  const starts = others.filter((f) => f.toLowerCase().startsWith(q))
  return [...starts, ...others.filter((f) => !starts.includes(f) && f.toLowerCase().includes(q))]
}

/** Dish family: type a new one, or tap one we have from the list that opens under the field. */
export function FamilyField({ value, onChange, families, placeholder }: {
  value: string
  onChange: (v: string) => void
  families: string[]
  placeholder: string
}) {
  const [open, setOpen] = useState(false)
  const shown = open ? familyOptions(families, value) : []
  return (
    <div className="combo">
      <label className="field" style={{ margin: 0 }}>
        Dish family
        <input value={value} maxLength={40} placeholder={placeholder} role="combobox" aria-expanded={shown.length > 0}
          aria-controls="family-options" aria-autocomplete="list" autoComplete="off"
          onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
          onChange={(e) => { onChange(e.target.value); setOpen(true) }}
          onKeyDown={(e) => { if (e.key === 'Escape' || e.key === 'Enter') setOpen(false) }} />
      </label>
      {shown.length > 0 && (
        <ul className="combo-list" id="family-options" role="listbox" aria-label="Our dish families">
          {shown.map((f) => (
            // mousedown, not click: the field mustn't lose focus (and close the list) first
            <li key={f} role="option" aria-selected={false} onMouseDown={(e) => { e.preventDefault(); onChange(f); setOpen(false) }}>{f}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
