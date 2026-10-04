import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { Meal, MealType } from '../api/types'
import { MEAL_TYPE_LABEL, todayISO } from '../lib/dates'
import { Sheet } from '../ui/Sheet'
import { Toggle } from '../ui/Toggle'
import { useToast } from '../ui/Toast'

export function CookSheet({ meal, open, onClose }: { meal: Meal; open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [type, setType] = useState<MealType>(meal.types[0])
  const [usedUp, setUsedUp] = useState<number[]>([])
  useEffect(() => {
    if (open) {
      setType(meal.types[0])
      setUsedUp([])
    }
  }, [open, meal.types])

  const cook = useMutation({
    mutationFn: () => api.cookMeal(meal.id, { meal_type: type, eaten_on: todayISO(), used_up: usedUp }),
    onSuccess: (updated) => {
      qc.setQueryData(['meal', String(meal.id)], updated)
      for (const key of ['meals', 'day', 'inventory', 'shopping']) qc.invalidateQueries({ queryKey: [key] })
      onClose()
      toast('Logged · ingredients updated')
    },
  })

  return (
    <Sheet open={open} onClose={onClose} label="Log this cook">
      <h1>Log this cook</h1>
      <p className="sub">Logs one portion as eaten today and deducts the ingredients from your stock.</p>
      <Toggle<MealType> label="Meal type" value={type} onChange={setType}
        options={(['breakfast', 'lunch', 'dinner'] as const).map((t) => ({ value: t, label: MEAL_TYPE_LABEL[t] }))} />
      <div className="card">
        <h3>Used up an ingredient?</h3>
        <div className="sub" style={{ margin: '2px 0 10px' }}>Tap anything you finished. It goes on your shopping list.</div>
        <div className="chips">
          {meal.ingredients.map(({ ingredient: i }) => {
            const on = usedUp.includes(i.id)
            return (
              <button key={i.id} className={`chip${on ? ' on' : ''}`} aria-pressed={on}
                onClick={() => setUsedUp((u) => (on ? u.filter((x) => x !== i.id) : [...u, i.id]))}>
                {i.emoji} {i.name}{on ? ' · used up' : ''}
              </button>
            )
          })}
        </div>
      </div>
      {cook.isError && <p className="error" role="alert">{cook.error.message}</p>}
      <button className="btn" disabled={cook.isPending} onClick={() => cook.mutate()}>Confirm</button>
    </Sheet>
  )
}
