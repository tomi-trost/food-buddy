import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { Meal, MealType } from '../api/types'
import { MEAL_TYPE_LABEL, todayISO } from '../lib/dates'
import { Sheet } from '../ui/Sheet'
import { Stepper } from '../ui/Stepper'
import { Toggle } from '../ui/Toggle'
import { useToast } from '../ui/Toast'

/** Log a known meal as eaten today: cooked now (stock goes down) or from what's already made. */
export function CookSheet({ meal, open, onClose, initialType }: {
  meal: Meal
  open: boolean
  onClose: () => void
  initialType?: MealType
}) {
  const qc = useQueryClient()
  const toast = useToast()
  const [type, setType] = useState<MealType>(initialType ?? meal.types[0])
  const [cooked, setCooked] = useState(true)
  const [servings, setServings] = useState(1)
  const [usedUp, setUsedUp] = useState<number[]>([])
  useEffect(() => {
    if (open) {
      setType(initialType ?? meal.types[0])
      setCooked(true)
      setServings(1)
      setUsedUp([])
    }
  }, [open, meal.types, initialType])

  const cook = useMutation({
    mutationFn: () =>
      api.cookMeal(meal.id, {
        meal_type: type,
        eaten_on: todayISO(),
        servings_eaten: servings,
        cooked,
        used_up: cooked ? usedUp : [],
      }),
    onSuccess: (updated) => {
      qc.setQueryData(['meal', String(meal.id)], updated)
      for (const key of ['meals', 'day', 'inventory', 'shopping']) qc.invalidateQueries({ queryKey: [key] })
      onClose()
      toast(cooked ? 'Logged · ingredients updated' : 'Logged')
    },
  })

  return (
    <Sheet open={open} onClose={onClose} label="Log this meal">
      <h1>{meal.emoji} {meal.name}</h1>
      <p className="sub">
        {cooked
          ? 'Logs what you ate today and takes the recipe out of your stock.'
          : 'Logs what you ate today. Stock stays as it is (it went down when it was cooked).'}
      </p>
      <Toggle<MealType> label="Meal type" value={type} onChange={setType}
        options={(['breakfast', 'lunch', 'dinner'] as const).map((t) => ({ value: t, label: MEAL_TYPE_LABEL[t] }))} />
      <Toggle<'now' | 'made'> label="Cooked" value={cooked ? 'now' : 'made'} onChange={(v) => setCooked(v === 'now')}
        options={[{ value: 'now', label: 'Cooked it now' }, { value: 'made', label: 'Already made' }]} />
      <div className="row" style={{ justifyContent: 'space-between', margin: '12px 0' }}>
        <span>Portions eaten</span>
        <Stepper label="portions eaten" value={servings} onChange={setServings} step={0.5} min={0.5} max={10} />
      </div>
      {cooked && (
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
      )}
      {cook.isError && <p className="error" role="alert">{cook.error.message}</p>}
      <button className="btn" disabled={cook.isPending} onClick={() => cook.mutate()}>
        Log {Math.round(meal.per_portion.kcal * servings)} kcal
      </button>
    </Sheet>
  )
}

/** CookSheet for a meal known only by id (from a list card); loads the full meal first. */
export function CookMealSheet({ mealId, initialType, onClose }: {
  mealId: number | null
  initialType?: MealType
  onClose: () => void
}) {
  const meal = useQuery({
    queryKey: ['meal', String(mealId)],
    queryFn: () => api.meal(mealId!),
    enabled: mealId !== null,
  })
  if (mealId === null || !meal.data) return null
  return <CookSheet meal={meal.data} open onClose={onClose} initialType={initialType} />
}
