import { type CSSProperties, useState } from 'react'
import type { Nutrients } from '../api/types'
import { NUTRIENT_KEYS, parseNutrient } from '../lib/macros'
import { Icon } from './Icon'
import { MAC } from './Macro'

const show = (n: number) => String(Math.round(n * 100) / 100)

/** Six number fields; reports the values when all are valid, else null. */
export function NutrientFields({ initial, onChange }: { initial: Nutrients; onChange: (n: Nutrients | null) => void }) {
  const [text, setText] = useState(() => Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, show(initial[k])])) as Record<keyof Nutrients, string>)

  const edit = (key: keyof Nutrients, value: string) => {
    const next = { ...text, [key]: value }
    setText(next)
    const parsed = NUTRIENT_KEYS.map((k) => parseNutrient(k, next[k]))
    onChange(parsed.every((n) => n !== null) ? (Object.fromEntries(NUTRIENT_KEYS.map((k, i) => [k, parsed[i]])) as Nutrients) : null)
  }

  return (
    <div className="nfields">
      {NUTRIENT_KEYS.map((k) => {
        const invalid = parseNutrient(k, text[k]) === null
        return (
          <label key={k} className="field" style={{ '--mc': MAC[k].color } as CSSProperties}>
            <span className="row" style={{ gap: 6 }}><Icon name={MAC[k].icon} size={16} />{MAC[k].name}{MAC[k].unit && ' (g)'}</span>
            <input inputMode="decimal" value={text[k]} aria-invalid={invalid} onChange={(e) => edit(k, e.target.value)} />
          </label>
        )
      })}
    </div>
  )
}
