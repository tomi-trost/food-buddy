import { useQuery } from '@tanstack/react-query'
import { type CSSProperties, useState } from 'react'
import { Link } from 'react-router'
import { api } from '../api/client'
import { useMe } from '../api/hooks'
import type { MealType, Nutrients, PlanSlot } from '../api/types'
import { MEAL_TYPE_LABEL, todayISO } from '../lib/dates'
import { expiryClass } from '../lib/stock'
import { ProgressBar, Ring } from '../ui/charts'
import { Avatar } from '../ui/Avatar'
import { Icon } from '../ui/Icon'
import { MAC } from '../ui/Macro'
import { Photo } from '../ui/Photo'
import { SettingsSheet } from './SettingsSheet'

const TYPES: MealType[] = ['breakfast', 'lunch', 'dinner']
// Carbs and fat have no personal goal in the mock; it uses these reference amounts.
const CARBS_REF = 250
const FAT_REF = 75

export function HomePage() {
  const me = useMe().data
  const today = todayISO()
  const [settings, setSettings] = useState(false)
  const day = useQuery({ queryKey: ['day', today], queryFn: () => api.day(today) })
  const plan = useQuery({ queryKey: ['plan'], queryFn: api.plan })
  const meals = useQuery({ queryKey: ['meals'], queryFn: api.meals })
  const stock = useQuery({ queryKey: ['inventory', today], queryFn: () => api.inventory(today) })
  const date = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })

  const totals = day.data?.totals
  const planned = plan.data?.status === 'approved' ? plan.data.days.find((d) => d.date === today) : undefined
  const unrated = [...(meals.data ?? [])]
    .filter((m) => !m.rated_by_me)
    .sort((a, b) => (b.last_cooked ?? '').localeCompare(a.last_cooked ?? ''))[0]
  const soon = (stock.data ?? []).filter((i) => i.days_left <= 3)

  return (
    <>
      <div className="top">
        <div>
          <div className="sub">{date}</div>
          <h1>Hi{me ? `, ${me.name}` : ''}</h1>
        </div>
        <div className="row">
          <Link to="/insights" className="icon" aria-label="Insights"><Icon name="insights" /></Link>
          <button aria-label="Settings" onClick={() => setSettings(true)}>{me && <Avatar name={me.name} color={me.color} />}</button>
        </div>
      </div>

      {me && totals && (
        <Link to="/insights" className="card row" style={{ textDecoration: 'none' }} aria-label="Today's nutrition">
          <Ring value={totals.kcal} goal={me.goals.kcal} />
          <div className="sp">
            {([
              ['protein', me.goals.protein], ['carbs', CARBS_REF], ['fat', FAT_REF],
              ['fiber', me.goals.fiber], ['sugar', me.goals.sugar],
            ] as [keyof Nutrients, number][]).map(([k, goal], i) => (
              <MacroBar key={k} nutrient={k} value={totals[k]} goal={goal} delay={i * 70} />
            ))}
          </div>
        </Link>
      )}

      <h2>Today</h2>
      <div className="card" style={{ padding: '4px 14px' }}>
        <div className="list">
          {TYPES.map((t) => {
            const entries = (day.data?.entries ?? []).filter((e) => e.meal_type === t)
            return (
              <div key={t} style={{ alignItems: 'flex-start' }}>
                <span className="sub" style={{ width: 70, paddingTop: 2, fontWeight: 600 }}>{MEAL_TYPE_LABEL[t]}</span>
                <div className="sp">
                  {entries.length ? entries.map((e) => (
                    <div key={e.id} style={{ marginBottom: 4 }}>
                      {e.emoji} {e.name} <span className="sub">· {Math.round(e.nutrients.kcal)} kcal</span>
                    </div>
                  )) : <span className="sub">Not logged</span>}
                </div>
                <Link to={`/snap?type=${t}`} className="icon" style={{ width: 36, height: 36 }} aria-label={`Log ${MEAL_TYPE_LABEL[t]}`}>
                  <Icon name="plus" size={18} />
                </Link>
              </div>
            )
          })}
        </div>
      </div>

      {planned ? (
        <>
          <h2>Planned today</h2>
          <div className="card" style={{ padding: '4px 14px' }}>
            <div className="list">{planned.slots.map((s) => <PlannedLine key={s.meal_type} slot={s} />)}</div>
          </div>
        </>
      ) : (
        <Link to="/plan" className="card row" style={{ textDecoration: 'none', marginTop: 12 }}>
          <span className="sub"><Icon name="plan" size={26} /></span>
          <div className="sp">
            <h3>{plan.data ? (plan.data.status === 'draft' ? 'Menu awaiting approval' : 'Plan the next week') : 'Plan the week'}</h3>
            <div className="sub">Breakfasts, lunches, dinners — from your best-rated meals</div>
          </div>
          <Icon name="chev" size={18} />
        </Link>
      )}

      {unrated && (
        <>
          <h2>Rate this meal</h2>
          <div className="card">
            <Link to={`/meals/${unrated.id}`} className="row" style={{ textDecoration: 'none' }}>
              <Photo url={unrated.photo_url} emoji={unrated.emoji} seed={unrated.id} alt="" style={{ width: 56, height: 56, aspectRatio: '1', fontSize: 28, flex: 'none' }} />
              <div className="sp"><h3>{unrated.name}</h3><div className="sub">waiting for your rating</div></div>
            </Link>
            <Link to={`/meals/${unrated.id}?rate=1`} className="btn sm" style={{ marginTop: 10 }}>Rate now</Link>
          </div>
        </>
      )}

      {!!soon.length && (
        <>
          <h2>Use soon</h2>
          <div className="card">
            <div className="chips">
              {soon.map((i) => (
                <span key={i.ingredient.id} className="chip">
                  {i.ingredient.emoji} {i.ingredient.name} <span className={expiryClass(i.days_left)}>{Math.max(i.days_left, 0)}d</span>
                </span>
              ))}
            </div>
          </div>
        </>
      )}
      <SettingsSheet open={settings} onClose={() => setSettings(false)} />
    </>
  )
}

function MacroBar({ nutrient, value, goal, delay }: { nutrient: keyof Nutrients; value: number; goal: number; delay: number }) {
  const m = MAC[nutrient]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '16px 1fr', columnGap: 7, rowGap: 2, margin: '7px 0', alignItems: 'center' } as CSSProperties}>
      <span />
      <div className="row" style={{ alignItems: 'baseline' }}>
        <span style={{ fontSize: 13 }}>{m.name}</span>
        <span className="sp" />
        <span className="sub" style={{ fontSize: 10.5 }}>{Math.round(value)} / {goal} g</span>
      </div>
      <span style={{ color: m.color, display: 'flex', lineHeight: 0 }}><Icon name={m.icon} size={16} /></span>
      <ProgressBar pct={goal ? (value / goal) * 100 : 0} color={m.color} delay={delay} />
    </div>
  )
}

function PlannedLine({ slot }: { slot: PlanSlot }) {
  const label = slot.mode === 'out' ? 'Eating out' : slot.mode === 'skip' ? 'Nothing planned' : slot.meal?.name ?? 'Pick a meal'
  const sub = slot.mode === 'prep' ? 'Meal prep' : slot.mode === 'cook' && slot.meal ? `${slot.meal.prep_minutes} min to cook` : ''
  const content = (
    <>
      <span className="sub" style={{ width: 70, fontWeight: 600 }}>{MEAL_TYPE_LABEL[slot.meal_type]}</span>
      <div className="sp">{label}{sub && <div className="sub">{sub}</div>}</div>
    </>
  )
  return slot.meal ? <Link to={`/meals/${slot.meal.id}`} style={{ textDecoration: 'none' }}>{content}</Link> : <div>{content}</div>
}
