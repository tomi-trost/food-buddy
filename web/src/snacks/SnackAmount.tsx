import { useState } from 'react'
import type { Nutrients, SnackPer } from '../api/types'
import { amountStep, amountUnit, perLabel, snackNutrients } from '../lib/snacks'
import { MacroTiles } from '../ui/Macro'
import { NutrientFields } from '../ui/NutrientFields'
import { Stepper } from '../ui/Stepper'

/** How much of a snack, and its values per piece / per 100 g / per 100 ml (editable). */
export function SnackAmount({ per, amount, perUnit, startEditing = false, onAmount, onPerUnit, onValid }: {
  per: SnackPer
  amount: number
  perUnit: Nutrients
  startEditing?: boolean // values still to be typed in
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
        <div className="sp"><h3>Amount</h3><div className="sub">{per === 'piece' ? 'how many pieces' : per === '100ml' ? 'ml you drank' : 'grams you ate'}</div></div>
        <Stepper label="amount" value={amount} step={step} min={step} max={2000} unit={amountUnit(per, amount)} onChange={onAmount} />
      </div>
      <section className="card">
        <div className="row">
          <div className="sp"><h3>Values per {perLabel(per)}</h3></div>
          <button type="button" className="btn ghost" style={{ width: 'auto', padding: '0 14px' }} aria-expanded={editing}
            disabled={!valid} onClick={() => setEditing((e) => !e)}>
            {editing ? 'Done' : 'Edit values'}
          </button>
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
