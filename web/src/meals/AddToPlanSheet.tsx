import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { api } from '../api/client'
import type { Meal, MealType } from '../api/types'
import { MEAL_TYPE_LABEL, MEAL_TYPE_SHORT } from '../lib/dates'
import { DAY_NAMES } from '../lib/plan'
import { Sheet } from '../ui/Sheet'
import { useToast } from '../ui/Toast'

const TYPES: MealType[] = ['breakfast', 'lunch', 'dinner']

export function AddToPlanSheet({ meal, open, onClose }: { meal: Meal; open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const navigate = useNavigate()
  const plan = useQuery({ queryKey: ['plan'], queryFn: api.plan, enabled: open })
  const put = useMutation({
    mutationFn: ({ day, type }: { day: number; type: MealType }) =>
      api.putSlot(day, type, { mode: 'cook', meal_id: meal.id }),
    onSuccess: (p, { day, type }) => {
      qc.setQueryData(['plan'], p)
      qc.invalidateQueries({ queryKey: ['shopping'] })
      onClose()
      toast(`Added to ${DAY_NAMES[day]} ${MEAL_TYPE_LABEL[type].toLowerCase()}`)
    },
  })

  return (
    <Sheet open={open} onClose={onClose} label="Add to plan">
      <h1>Add to plan</h1>
      <div className="sub" style={{ marginBottom: 10 }}>
        Pick the slot for {meal.name}. Greyed slots don't match its meal type ({meal.types.map((t) => MEAL_TYPE_LABEL[t]).join(' / ')}).
      </div>
      {plan.isSuccess && !plan.data && (
        <button className="btn" onClick={() => navigate('/plan')}>Plan the week first</button>
      )}
      {plan.data && (
        <div className="wgrid">
          <span />
          {TYPES.map((t) => <span key={t} className="hd">{MEAL_TYPE_SHORT[t]}</span>)}
          {plan.data.days.map((d, i) => (
            <Row key={d.date} day={i} slots={d.slots} mealId={meal.id} types={meal.types} onPick={(type) => put.mutate({ day: i, type })} />
          ))}
        </div>
      )}
      {put.isError && <p className="error" role="alert">{put.error.message}</p>}
    </Sheet>
  )
}

function Row({ day, slots, mealId, types, onPick }: {
  day: number
  slots: { meal_type: MealType; mode: string; meal: { id: number; name: string; emoji: string } | null }[]
  mealId: number
  types: MealType[]
  onPick: (t: MealType) => void
}) {
  return (
    <>
      <b className="sub">{DAY_NAMES[day]}</b>
      {slots.map((s) => (
        <button key={s.meal_type} className="cell" disabled={!types.includes(s.meal_type)}
          style={s.meal?.id === mealId ? { outline: '2px solid var(--accent)' } : undefined}
          aria-label={`${DAY_NAMES[day]} ${s.meal_type}`} onClick={() => onPick(s.meal_type)}>
          {s.mode === 'out' ? 'Out' : s.mode === 'skip' ? '–' : s.meal ? `${s.meal.emoji} ${s.meal.name.split(' ')[0]}` : '+'}
        </button>
      ))}
    </>
  )
}
