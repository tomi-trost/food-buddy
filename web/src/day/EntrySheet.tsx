import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { api } from '../api/client'
import type { LogEntry, LogPatch, MealType, Nutrients } from '../api/types'
import { MEAL_TYPE_LABEL } from '../lib/dates'
import { scale } from '../lib/macros'
import { SnackAmount } from '../snacks/SnackAmount'
import { MacroTiles } from '../ui/Macro'
import { Sheet } from '../ui/Sheet'
import { Stepper } from '../ui/Stepper'
import { useToast } from '../ui/Toast'
import { Toggle } from '../ui/Toggle'

/** One thing I ate today: change how much (and for snacks the values), or take it off the day. */
export function EntrySheet({ entry, onClose }: { entry: LogEntry | null; onClose: () => void }) {
  return (
    <Sheet open={!!entry} onClose={onClose} label="What you ate">
      {entry && <EntryForm key={entry.id} entry={entry} onClose={onClose} />}
    </Sheet>
  )
}

function EntryForm({ entry, onClose }: { entry: LogEntry; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const isMeal = entry.kind === 'meal'
  const [servings, setServings] = useState(entry.servings)
  const [mealType, setMealType] = useState<MealType>(isMeal ? (entry.meal_type as MealType) : 'lunch')
  const [perUnit, setPerUnit] = useState<Nutrients | null>(entry.per_unit)
  const [valid, setValid] = useState(true)

  const done = (message: string) => {
    qc.invalidateQueries({ queryKey: ['day'] })
    qc.invalidateQueries({ queryKey: ['insights'] })
    qc.invalidateQueries({ queryKey: ['rewards'] })
    qc.invalidateQueries({ queryKey: ['meals'] }) // removing a meal changes its cook count
    onClose()
    toast(message)
  }
  const save = useMutation({
    mutationFn: () => {
      const patch: LogPatch = isMeal ? { servings, meal_type: mealType } : { servings, ...(perUnit && { per_unit: perUnit }) }
      return api.editLog(entry.id, patch)
    },
    onSuccess: () => done('Updated'),
  })
  const remove = useMutation({ mutationFn: () => api.removeLog(entry.id), onSuccess: () => done(`${entry.name} removed from today`) })
  const busy = save.isPending || remove.isPending
  const error = save.error ?? remove.error

  return (
    <>
      <h1>{entry.emoji} {entry.name}</h1>
      {isMeal ? (
        <>
          {/* the logged values scale with the portions; the meal's own values are edited on the meal */}
          <MacroTiles values={scale(entry.nutrients, (servings / entry.servings) * 100)} label="What you ate" />
          <div className="card row" style={{ marginTop: 14 }}>
            <div className="sp"><h3>Portions you ate</h3></div>
            <Stepper label="portions eaten" value={servings} step={0.5} min={0.5} max={10} onChange={setServings} />
          </div>
          <Toggle<MealType> label="Meal" value={mealType} onChange={setMealType}
            options={(['breakfast', 'lunch', 'dinner'] as const).map((t) => ({ value: t, label: MEAL_TYPE_LABEL[t] }))} />
          {entry.meal_id && <Link to={`/meals/${entry.meal_id}`} className="btn ghost" onClick={onClose}>Open the meal</Link>}
        </>
      ) : perUnit && entry.per ? (
        <SnackAmount per={entry.per} amount={servings} perUnit={perUnit} onAmount={setServings} onPerUnit={setPerUnit} onValid={setValid} />
      ) : (
        <MacroTiles values={entry.nutrients} label="What you ate" />
      )}
      {error && <p className="error" role="alert">{error.message}</p>}
      <button className="btn" style={{ marginTop: 14 }} disabled={busy || !valid} onClick={() => save.mutate()}>Save</button>
      <button className="btn ghost" style={{ marginTop: 8, color: 'var(--bad)' }} disabled={busy} onClick={() => remove.mutate()}>
        Remove from today
      </button>
      {isMeal && <p className="sub" style={{ marginTop: 8 }}>The meal stays in your meals. Ingredients at home stay as they are.</p>}
    </>
  )
}
