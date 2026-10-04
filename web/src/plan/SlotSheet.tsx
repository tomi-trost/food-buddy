import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import type { MealType, Plan, PlanMode } from '../api/types'
import { MEAL_TYPE_LABEL } from '../lib/dates'
import { DAY_NAMES } from '../lib/plan'
import { Photo } from '../ui/Photo'
import { Sheet } from '../ui/Sheet'
import { Toggle } from '../ui/Toggle'

export function SlotSheet({ plan, day, type, onClose }: { plan: Plan; day: number; type: MealType; onClose: () => void }) {
  const qc = useQueryClient()
  const slot = plan.days[day].slots.find((s) => s.meal_type === type)!
  const options = useQuery({
    queryKey: ['plan', 'options', plan.id, day, type, slot.mode],
    queryFn: () => api.slotOptions(day, type),
    enabled: slot.mode === 'cook' || slot.mode === 'prep',
  })
  const put = useMutation({
    mutationFn: (body: { mode: PlanMode; meal_id?: number }) => api.putSlot(day, type, body),
    onSuccess: (p, body) => {
      qc.setQueryData(['plan'], p)
      qc.invalidateQueries({ queryKey: ['shopping'] })
      if (body.meal_id) onClose()
    },
  })

  return (
    <Sheet open onClose={onClose} label="Edit slot">
      <h1>{DAY_NAMES[day]} · {MEAL_TYPE_LABEL[type]}</h1>
      <Toggle<PlanMode> label="Slot mode" value={slot.mode} onChange={(mode) => put.mutate({ mode })}
        options={[
          { value: 'cook', label: 'Cook' }, { value: 'prep', label: 'Meal prep' },
          { value: 'out', label: 'Out' }, { value: 'skip', label: 'Skip' },
        ]} />
      {slot.mode === 'out' && <p className="sub">Eating out — no groceries needed.</p>}
      {slot.mode === 'skip' && <p className="sub">Nothing planned.</p>}
      {(slot.mode === 'cook' || slot.mode === 'prep') && (
        options.data?.length ? (
          <div className="list">
            {options.data.map((m) => (
              <button key={m.id} className="row" style={{ width: '100%', textAlign: 'left' }} onClick={() => put.mutate({ mode: slot.mode, meal_id: m.id })}>
                <Photo url={m.photo_url} emoji={m.emoji} seed={m.id} alt="" style={{ width: 56, height: 56, aspectRatio: '1', fontSize: 28, flex: 'none' }} />
                <div className="sp">
                  <h3>{m.name}{slot.meal?.id === m.id ? ' ✓' : ''}</h3>
                  <div className="sub">{m.prep_minutes} min{m.score !== null ? ` · rated ${Math.round(m.score * 10) / 10}` : ' · new'}</div>
                </div>
              </button>
            ))}
          </div>
        ) : options.isSuccess && <p className="sub">Nothing fits this slot{slot.mode === 'prep' ? ' (mark meals as prep-friendly on their page)' : ''}.</p>
      )}
      {put.isError && <p className="error" role="alert">{put.error.message}</p>}
    </Sheet>
  )
}
