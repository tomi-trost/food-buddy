import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { api } from '../api/client'
import { useMe } from '../api/hooks'
import type { LogEntry, Nutrients, PlanSlot } from '../api/types'
import { EntrySheet } from '../day/EntrySheet'
import { MEAL_TYPE_LABEL, todayISO } from '../lib/dates'
import { expiryClass } from '../lib/stock'
import { todayRows } from '../lib/today'
import { ProgressBar, Ring } from '../ui/charts'
import { Avatar } from '../ui/Avatar'
import { Icon } from '../ui/Icon'
import { MAC } from '../ui/Macro'
import { Photo } from '../ui/Photo'
import { SnacksCard } from '../snacks/SnacksCard'
import { SettingsSheet } from './SettingsSheet'

// Carbs and fat have no personal goal in the mock; it uses these reference amounts.
const CARBS_REF = 250
const FAT_REF = 75

export function HomePage() {
  const me = useMe().data
  const today = todayISO()
  const [settings, setSettings] = useState(false)
  const [entry, setEntry] = useState<LogEntry | null>(null)
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
        <Link to="/insights" className="card today" style={{ textDecoration: 'none' }} aria-label="Today's nutrition">
          <Ring value={totals.kcal} goal={me.goals.kcal} />
          <div className="mbars">
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
        <div className="list" aria-label="Today">
          {todayRows(day.data?.entries ?? []).map((row) => row.kind === 'snack' ? (
            <button key={`s${row.entry.id}`} className="today-snack" onClick={() => setEntry(row.entry)}>
              <span className="sub" style={{ width: 70 }}>{row.time}</span>
              <span className="sp">{row.entry.emoji} {row.entry.name} <span className="sub">· {Math.round(row.entry.nutrients.kcal)} kcal</span></span>
            </button>
          ) : (
            <div key={row.mealType} style={{ alignItems: 'flex-start' }}>
              <span className="sub" style={{ width: 70, paddingTop: 2, fontWeight: 600 }}>{MEAL_TYPE_LABEL[row.mealType]}</span>
              <div className="sp">
                {row.entries.length ? row.entries.map((e) => (
                  <div key={e.id} className="today-entry">
                    {e.meal_id ? (
                      <Link to={`/meals/${e.meal_id}`} className="sp">
                        {e.emoji} {e.name} <span className="sub">· {Math.round(e.nutrients.kcal)} kcal</span>
                      </Link>
                    ) : (
                      <button className="sp" onClick={() => setEntry(e)}>
                        {e.emoji} {e.name} <span className="sub">· {Math.round(e.nutrients.kcal)} kcal</span>
                      </button>
                    )}
                    <button className="icon" style={{ width: 32, height: 32 }} aria-label={`Change ${e.name}`} onClick={() => setEntry(e)}>
                      <Icon name="edit" size={16} />
                    </button>
                  </div>
                )) : <span className="sub">Not logged</span>}
              </div>
              <Link to={`/snap?type=${row.mealType}`} className="icon" style={{ width: 36, height: 36 }} aria-label={`Log ${MEAL_TYPE_LABEL[row.mealType]}`}>
                <Icon name="plus" size={18} />
              </Link>
            </div>
          ))}
        </div>
      </div>
      <EntrySheet entry={entry} onClose={() => setEntry(null)} />

      {me && <SnacksCard me={me} entries={day.data?.entries ?? []} />}

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
    <div className="mbar">
      <span className="mbar-name" style={{ color: m.color }}><Icon name={m.icon} size={14} /><span>{m.name}</span></span>
      <span className="sub mbar-val">{Math.round(value)} / {goal} g</span>
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
