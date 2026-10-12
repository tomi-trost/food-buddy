import { useState } from 'react'
import type { Nutrients } from '../api/types'
import { MacroTiles } from '../ui/Macro'
import { NutrientFields } from '../ui/NutrientFields'

/** Nutrition per portion: calculated from the ingredients, or values typed in instead. */
export function NutritionOverride({ calculated, override, onChange, onValid, showTiles = false }: {
  calculated: Nutrients
  override: Nutrients | null
  onChange: (override: Nutrients | null) => void
  onValid?: (valid: boolean) => void // false while a typed value is invalid
  showTiles?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [valid, setValid] = useState(true)
  const [round, setRound] = useState(0) // remounts the fields after a reset
  const current = override ?? calculated
  const report = (ok: boolean) => {
    setValid(ok)
    onValid?.(ok)
  }

  return (
    <section className="card">
      <div className="row">
        <div className="sp">
          <h3>Per portion</h3>
          <div className="sub">
            {override ? `Your values · calculated ${Math.round(calculated.kcal)} kcal` : 'Calculated from the ingredients'}
          </div>
        </div>
        <button type="button" className="btn ghost" style={{ width: 'auto', padding: '0 14px' }} aria-expanded={editing}
          disabled={!valid} onClick={() => setEditing((e) => !e)}>
          {editing ? 'Done' : 'Edit values'}
        </button>
      </div>
      {showTiles && <div style={{ marginTop: 10 }}><MacroTiles values={current} label="Per portion" /></div>}
      {editing && (
        <NutrientFields key={round} initial={current} onChange={(n) => {
          report(n !== null)
          if (n) onChange(n)
        }} />
      )}
      {!valid && <p className="error" role="alert">Fix the values marked in red.</p>}
      {override && (
        <button type="button" className="textbtn" onClick={() => {
          onChange(null)
          report(true)
          setRound((r) => r + 1)
        }}>
          Use the calculated values
        </button>
      )}
    </section>
  )
}
