import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { Meal, MealKind } from '../api/types'
import { todayISO } from '../lib/dates'
import { amountHint, amountMin, amountStep, amountUnit, isCounted, piecesIn, snackNutrients } from '../lib/snacks'
import { Sheet } from '../ui/Sheet'
import { Stepper } from '../ui/Stepper'
import { typeOption } from '../ui/mealTypes'
import { Toggle } from '../ui/Toggle'
import { useToast } from '../ui/Toast'

const MEALS = ['breakfast', 'lunch', 'dinner'] as const

/** One usual portion in the snack's unit: a portion, its pieces, or its grams / ml. */
export function usualAmount(meal: Pick<Meal, 'per' | 'piece_g' | 'portion_g'>): number {
  if (meal.per === 'portion') return 1
  if (meal.per === 'piece') return piecesIn(meal.portion_g, meal.piece_g || meal.portion_g || 1)
  return Math.max(1, Math.round(meal.portion_g))
}

/** Log a known meal as eaten today: cooked now (stock goes down) or from what's already made.
 *  A snack (0025) is logged by its amount; a product always comes out of what's at home. */
export function CookSheet({ meal, open, onClose, initialType }: {
  meal: Meal
  open: boolean
  onClose: () => void
  initialType?: MealKind
}) {
  const qc = useQueryClient()
  const toast = useToast()
  const first = (): MealKind => (initialType && (initialType !== 'snack' || meal.types.includes('snack')) ? initialType : meal.types[0])
  const [type, setType] = useState<MealKind>(first)
  const snack = type === 'snack'
  const [cooked, setCooked] = useState(!snack || meal.is_product)
  const [servings, setServings] = useState(1)
  const [amount, setAmount] = useState(() => usualAmount(meal))
  const [usedUp, setUsedUp] = useState<number[]>([])
  useEffect(() => {
    if (open) {
      const t = first()
      setType(t)
      setCooked(t !== 'snack' || meal.is_product) // a home-made snack is usually from the jar
      setServings(1)
      setAmount(usualAmount(meal))
      setUsedUp([])
    }
  }, [open, meal, initialType])

  const kcal = snack
    ? snackNutrients({ per: meal.per, amount, per_unit: meal.per_unit }).kcal
    : meal.per_portion.kcal * servings
  const cook = useMutation({
    mutationFn: () =>
      api.cookMeal(meal.id, {
        meal_type: type,
        eaten_on: todayISO(),
        ...(snack ? { amount } : { servings_eaten: servings }),
        cooked,
        used_up: cooked ? usedUp : [],
      }),
    onSuccess: (updated) => {
      qc.setQueryData(['meal', String(meal.id)], updated)
      for (const key of ['meals', 'day', 'inventory', 'shopping', 'insights', 'rewards']) qc.invalidateQueries({ queryKey: [key] })
      onClose()
      toast(cooked ? 'Logged · ingredients updated' : 'Logged')
    },
  })
  const types: MealKind[] = [...MEALS, ...(meal.types.includes('snack') ? ['snack' as const] : [])]

  return (
    <Sheet open={open} onClose={onClose} label={snack ? 'Log this snack' : 'Log this meal'}>
      <h1>{meal.emoji} {meal.name}</h1>
      <p className="sub">
        {snack && meal.is_product
          ? 'Logs what you had today and takes it from what’s at home, if it’s there.'
          : cooked
            ? `Logs what you ate today and takes the recipe out of your stock.`
            : 'Logs what you ate today. Stock stays as it is (it went down when it was made).'}
      </p>
      <Toggle<MealKind> label="Meal type" value={type} onChange={(t) => { setType(t); setCooked(t !== 'snack' || meal.is_product) }}
        stack options={types.map((t) => typeOption(t))} />
      {!(snack && meal.is_product) && (
        <Toggle<'now' | 'made'> label="Cooked" value={cooked ? 'now' : 'made'} onChange={(v) => setCooked(v === 'now')}
          options={[
            { value: 'now', label: snack ? 'Made it now' : 'Cooked it now' },
            { value: 'made', label: 'Already made' },
          ]} />
      )}
      {snack ? (
        <div className="row" style={{ justifyContent: 'space-between', margin: '12px 0' }}>
          <span>Amount <small className="sub">{amountHint(meal.per)}</small></span>
          <Stepper label="amount" value={amount} onChange={setAmount} step={amountStep(meal.per)} min={amountMin(meal.per)}
            max={isCounted(meal.per) ? 50 : 5000} unit={amountUnit(meal.per, amount)} />
        </div>
      ) : (
        <div className="row" style={{ justifyContent: 'space-between', margin: '12px 0' }}>
          <span>Portions eaten</span>
          <Stepper label="portions eaten" value={servings} onChange={setServings} step={0.5} min={0.5} max={10} />
        </div>
      )}
      {cooked && (
        <div className="card">
          <h3>Used up an ingredient?</h3>
          <div className="sub" style={{ margin: '2px 0 10px' }}>Tap anything you finished. It goes on your shopping list.</div>
          <div className="chips">
            {[...meal.ingredients, ...meal.components.flatMap((c) => c.ingredients)] // a bundle: its dishes' too
              .map(({ ingredient }) => ingredient)
              .filter((i, n, all) => all.findIndex((x) => x.id === i.id) === n)
              .map((i) => {
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
        Log {Math.round(kcal)} kcal
      </button>
    </Sheet>
  )
}

/** CookSheet for a meal known only by id (from a list card); loads the full meal first. */
export function CookMealSheet({ mealId, initialType, onClose }: {
  mealId: number | null
  initialType?: MealKind
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
