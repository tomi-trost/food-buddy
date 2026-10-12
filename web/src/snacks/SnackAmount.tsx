import { useState } from 'react'
import type { Nutrients } from '../api/types'
import { amountStep, snackNutrients } from '../lib/snacks'
import { MacroTiles } from '../ui/Macro'
import { NutrientFields } from '../ui/NutrientFields'
import { Stepper } from '../ui/Stepper'

/** How much of a snack, and its values per piece / per 100 g (editable). */
export function SnackAmount({ per, amount, perUnit, onAmount, onPerUnit, onValid }: {
  per: 'piece' | '100g'
  amount: number
  perUnit: Nutrients
  onAmount: (amount: number) => void
  onPerUnit: (perUnit: Nutrients) => void
  onValid: (valid: boolean) => void
}) {
  const [editing, setEditing] = useState(false)
  const [valid, setValid] = useState(true)
  const step = amountStep(per)
  const unit = per === 'piece' ? (amount === 1 ? ' piece' : ' pieces') : ' g'

  return (
    <>
      <MacroTiles values={snackNutrients({ per, amount, per_unit: perUnit })} label="This snack" />
      <div className="card row" style={{ marginTop: 14 }}>
        <div className="sp"><h3>Amount</h3><div className="sub">{per === 'piece' ? 'how many pieces' : 'grams you ate'}</div></div>
        <Stepper label="amount" value={amount} step={step} min={step} max={2000} unit={unit} onChange={onAmount} />
      </div>
      <section className="card">
        <div className="row">
          <div className="sp"><h3>{per === 'piece' ? 'Values per piece' : 'Values per 100 g'}</h3></div>
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
