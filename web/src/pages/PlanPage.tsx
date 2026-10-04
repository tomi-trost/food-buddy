import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { api } from '../api/client'
import { useMe } from '../api/hooks'
import type { MealType, Plan, PlanSlot } from '../api/types'
import { MEAL_TYPE_SHORT } from '../lib/dates'
import { dayLabel } from '../lib/plan'
import { ShoppingView } from '../plan/ShoppingView'
import { SlotSheet } from '../plan/SlotSheet'
import { WizardSheet } from '../plan/WizardSheet'
import { Avatar } from '../ui/Avatar'
import { Icon, type IconName } from '../ui/Icon'
import { Photo } from '../ui/Photo'
import { StarNum } from '../ui/Stars'
import { Toggle } from '../ui/Toggle'
import { useToast } from '../ui/Toast'

export function PlanPage() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'shop' ? 'shop' : 'menu'
  const plan = useQuery({ queryKey: ['plan'], queryFn: api.plan })
  const shopping = useQuery({ queryKey: ['shopping'], queryFn: api.shopping })
  const [wizard, setWizard] = useState(false)
  const ranOut = shopping.data?.items.some((i) => i.ran_out)

  return (
    <>
      <div className="top"><h1>Plan</h1></div>
      <Toggle<'menu' | 'shop'> label="Plan sections" value={tab} onChange={(v) => setParams(v === 'shop' ? { tab: 'shop' } : {}, { replace: true })}
        options={[{ value: 'menu', label: 'Menu' }, { value: 'shop', label: `Shopping list${ranOut ? ' •' : ''}`, ariaLabel: 'Shopping list' }]} />
      {tab === 'shop' ? <ShoppingView /> : plan.data ? (
        <Menu plan={plan.data} onReplan={() => setWizard(true)} />
      ) : plan.isSuccess && (
        <div className="card" style={{ textAlign: 'center', padding: '30px 20px' }}>
          <div className="sub" style={{ marginBottom: 8 }}><Icon name="plan" size={36} /></div>
          <h3>No menu yet</h3>
          <p className="sub">Set what each meal looks like — cook, meal prep or eating out — and we'll pick your best-rated meals.</p>
          <button className="btn" onClick={() => setWizard(true)}>Plan the week</button>
        </div>
      )}
      {plan.isError && <p className="error" role="alert">{plan.error.message}</p>}
      <WizardSheet open={wizard} onClose={() => setWizard(false)} initial={plan.data?.wizard} />
    </>
  )
}

function Menu({ plan, onReplan }: { plan: Plan; onReplan: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [, setParams] = useSearchParams()
  const me = useMe().data
  const [slot, setSlot] = useState<{ day: number; type: MealType } | null>(null)
  const approve = useMutation({
    mutationFn: api.approvePlan,
    onSuccess: (p) => {
      qc.setQueryData(['plan'], p)
      qc.invalidateQueries({ queryKey: ['shopping'] })
      if (p.status === 'approved') {
        toast('Menu approved — shopping list ready')
        setParams({ tab: 'shop' }, { replace: true })
      } else toast('Approved. Waiting for your partner.')
    },
  })
  const s = plan.summary
  const mine = plan.approvals.find((a) => a.user_id === me?.id)
  const tiles: [string, number | string, IconName][] = [
    ['Cook', s.cook, 'flame'], ['Prep', s.prep, 'box'], ['Out', s.out, 'pin'], ['Skip', s.skip, 'minus'], ['groceries', s.grocery_cost.toFixed(2), 'cost'],
  ]

  return (
    <>
      <div className="card row" style={{ gap: 0, textAlign: 'center', padding: '16px 8px' }} aria-label="Week summary">
        {tiles.map(([label, n, icon]) => (
          <div className="sp" key={label}>
            <div className="sub" style={{ marginBottom: 10 }}><Icon name={icon} size={18} /></div>
            <b style={{ fontSize: 18 }}>{n}</b>
            <div className="sub" style={{ marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>
      {!!s.batch_cook.length && (
        <div className="card sub" style={{ display: 'flex', gap: 8 }}>
          <Icon name="box" size={18} />
          <span>Batch cook: {s.batch_cook.map((b, i) => (
            <span key={b.meal_id}>{i > 0 && ', '}<b style={{ color: 'var(--ink)' }}>{b.name}</b> ×{b.times}</span>
          ))}</span>
        </div>
      )}
      {plan.days.map((d, i) => (
        <div className="dayc" key={d.date}>
          <header>
            <span>{dayLabel(d.date, i)}</span>
            <span style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>{d.kcal} kcal planned</span>
          </header>
          {d.slots.map((sl) => <SlotRow key={sl.meal_type} slot={sl} onClick={() => setSlot({ day: i, type: sl.meal_type })} />)}
        </div>
      ))}
      <div className="card row">
        {plan.approvals.map((a) => (
          <div key={a.user_id} className="row sp">
            <Avatar name={a.name} color={a.color} size={32} />
            <span className="sp">{a.approved ? 'Approved' : 'Pending'}</span>
          </div>
        ))}
      </div>
      {plan.status === 'approved' ? (
        <button className="btn ghost" onClick={onReplan}>Re-plan</button>
      ) : (
        <>
          <button className="btn" disabled={mine?.approved || approve.isPending} onClick={() => approve.mutate()}>
            {mine?.approved ? 'Approved — waiting for partner' : `Approve as ${me?.name ?? 'me'}`}
          </button>
          <button className="btn ghost" style={{ marginTop: 8 }} onClick={onReplan}>Change time budget</button>
        </>
      )}
      {slot && <SlotSheet plan={plan} day={slot.day} type={slot.type} onClose={() => setSlot(null)} />}
    </>
  )
}

function SlotRow({ slot, onClick }: { slot: PlanSlot; onClick: () => void }) {
  const m = slot.meal
  const icon: IconName | null = slot.mode === 'out' ? 'pin' : slot.mode === 'skip' ? 'minus' : m ? null : 'plus'
  const title = slot.mode === 'out' ? 'Eating out' : slot.mode === 'skip' ? 'Nothing planned' : m ? m.name : 'Pick a meal'
  const muted = slot.mode === 'out' || slot.mode === 'skip'
  return (
    <button className="slot" onClick={onClick}>
      <span className="tl">{MEAL_TYPE_SHORT[slot.meal_type]}</span>
      {icon ? <div className="th"><Icon name={icon} size={18} /></div> : (
        <Photo url={m!.photo_url} emoji={m!.emoji} seed={m!.id} alt="" style={{ width: 36, height: 36, aspectRatio: '1', fontSize: 18, flex: 'none', borderRadius: 'var(--r2)' }} />
      )}
      <div className="sp">
        <h3 style={muted ? { color: 'var(--ink2)', fontWeight: 500 } : undefined}>{title}</h3>
        {slot.mode === 'cook' && m && (
          <div className="sub" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Icon name="flame" size={12} /> Cook · {m.prep_minutes} of {slot.minutes} min
            {m.score !== null && <> · <StarNum value={m.score} /></>}
          </div>
        )}
        {slot.mode === 'prep' && (
          <div className="sub" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Icon name="box" size={12} /> Meal prep · no cooking
            {m?.score != null && <> · <StarNum value={m.score} /></>}
          </div>
        )}
      </div>
      <Icon name="chev" size={16} />
    </button>
  )
}
