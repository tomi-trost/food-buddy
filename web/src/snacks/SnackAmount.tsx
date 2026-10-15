import { useState } from 'react'
import type { Nutrients, SnackPer } from '../api/types'
import { amountHint, amountStep, amountUnit, perLabel, snackNutrients } from '../lib/snacks'
import { MacroTiles } from '../ui/Macro'
import { NutrientFields } from '../ui/NutrientFields'
import { Stepper } from '../ui/Stepper'

/** How much of a snack, and its values per portion / piece / 100 g / 100 ml (editable unless
 *  `fixed`: one of our snacks, whose values are edited on the snack). */
export function SnackAmount({ per, amount, perUnit, startEditing = false, fixed = false, onAmount, onPerUnit, onValid }: {
  per: SnackPer
  amount: number
  perUnit: Nutrients
  startEditing?: boolean // values still to be typed in
  fixed?: boolean
  onAmount: (amount: number) => void
  onPerUnit: (perUnit: Nutrients) => void
  onValid: (valid: boolean) => void
}) {
  const [editing, setEditing] = useState(startEditing)
  const [valid, setValid] = useState(true)
  const step = amountStep(per)

  return (
    <>
      <MacroTiles values={snackNutrients({ per, amount, per_unit: perUnit })} label="This snack" />
      <div className="card row" style={{ marginTop: 14 }}>
        <div className="sp"><h3>Amount</h3><div className="sub">{amountHint(per)}</div></div>
        <Stepper label="amount" value={amount} step={step} min={step} max={2000} unit={amountUnit(per, amount)} onChange={onAmount} />
      </div>
      <section className="card">
        <div className="row">
          <div className="sp"><h3>Values per {perLabel(per)}</h3></div>
          {fixed ? <span className="sub">{Math.round(perUnit.kcal)} kcal</span> : (
            <button type="button" className="btn ghost" style={{ width: 'auto', padding: '0 14px' }} aria-expanded={editing}
              disabled={!valid} onClick={() => setEditing((e) => !e)}>
              {editing ? 'Done' : 'Edit values'}
            </button>
          )}
        </div>
        {editing && (
          <NutrientFields initial={perUnit} onChange={(n) => {
            setValid(n !== null)
            onValid(n !== null)
            if (n) onPerUnit(n)
          }} />
        )}
        {!valid && <p className="error" role="alert">Fix the values marked in red.</p>}
      </section>
    </>
  )
}
