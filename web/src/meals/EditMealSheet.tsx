import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import type { Meal, MealType } from '../api/types'
import { MEAL_TYPE_LABEL } from '../lib/dates'
import { Sheet } from '../ui/Sheet'

const TYPES: MealType[] = ['breakfast', 'lunch', 'dinner']

/** Planner settings for a meal: which slots it fits and whether it batch-cooks well. */
export function EditMealSheet({ meal, open, onClose }: { meal: Meal; open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const patch = useMutation({
    mutationFn: (p: Parameters<typeof api.patchMeal>[1]) => api.patchMeal(meal.id, p),
    onSuccess: (m) => {
      qc.setQueryData(['meal', String(meal.id)], m)
      qc.invalidateQueries({ queryKey: ['meals'] })
    },
  })
  const prepFriendly = meal.tags.includes('prep-friendly')

  return (
    <Sheet open={open} onClose={onClose} label="Edit meal">
      <h1>Edit meal</h1>
      <h2>Good for</h2>
      <div className="chips" role="group" aria-label="Meal types">
        {TYPES.map((t) => {
          const on = meal.types.includes(t)
          return (
            <button key={t} className={`chip${on ? ' on' : ''}`} aria-pressed={on}
              disabled={on && meal.types.length === 1}
              onClick={() => patch.mutate({ types: on ? meal.types.filter((x) => x !== t) : [...meal.types, t] })}>
              {MEAL_TYPE_LABEL[t]}
            </button>
          )
        })}
      </div>
      <h2>Meal prep</h2>
      <div className="card row">
        <div className="sp">
          <h3>Prep-friendly</h3>
          <div className="sub">Keeps well for a few days — the planner uses it for "Prep" slots.</div>
        </div>
        <button className={`chip${prepFriendly ? ' on' : ''}`} aria-pressed={prepFriendly}
          onClick={() => patch.mutate({ prep_friendly: !prepFriendly })}>
          {prepFriendly ? 'Yes' : 'No'}
        </button>
      </div>
      {patch.isError && <p className="error" role="alert">{patch.error.message}</p>}
      <button className="btn ghost" onClick={onClose}>Done</button>
    </Sheet>
  )
}
