import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { type CSSProperties, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { api } from '../api/client'
import { useMe } from '../api/hooks'
import type { MealCard, MemberInsights, SourceGroup } from '../api/types'
import { addDays, todayISO } from '../lib/dates'
import { avg, CHALLENGE_TARGET, CHALLENGES, type Challenge, challengeProgress, dailyAverage, fiberHit, macroSplit, RANGE_DAYS, type Range, rangeLabel, versus } from '../lib/insights'
import { GoalCalendar } from '../insights/GoalCalendar'
import { SnacksInsights } from '../snacks/SnacksInsights'
import { Avatar } from '../ui/Avatar'
import { BarChart, Donut } from '../ui/charts'
import { Icon } from '../ui/Icon'
import { MacroTiles } from '../ui/Macro'
import { MEAL_TYPE_ICON } from '../ui/mealTypes'
import { Photo } from '../ui/Photo'
import { StarNum } from '../ui/Stars'
import { Toggle } from '../ui/Toggle'

type Tab = 'overview' | 'calendar' | 'versus' | 'snacks'
const TABS: Tab[] = ['overview', 'calendar', 'versus', 'snacks']
const WEEKDAY = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const weekdayOf = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return WEEKDAY[new Date(y, m - 1, d).getDay()]
}

export function InsightsPage() {
  const navigate = useNavigate()
  const me = useMe().data
  const today = todayISO()
  const [params] = useSearchParams()
  const [tab, setTab] = useState<Tab>(TABS.find((t) => t === params.get('tab')) ?? 'overview')
  const [who, setWho] = useState<number | null>(null)
  const insights = useQuery({ queryKey: ['insights', today], queryFn: () => api.insights(today) })
  const meals = useQuery({ queryKey: ['meals'], queryFn: api.meals })
  const members = insights.data?.members ?? []
  const selected = members.find((m) => m.user_id === (who ?? me?.id)) ?? members[0]

  return (
    <>
      <div className="top">
        <button className="icon" aria-label="Back" onClick={() => navigate(-1)}><Icon name="back" /></button>
        <h1>Insights</h1>
        <span style={{ width: 44 }} />
      </div>
      <Toggle<Tab> variant="tabs" label="Insights sections" value={tab} onChange={setTab}
        options={[{ value: 'overview', label: 'Overview' }, { value: 'calendar', label: 'Calendar' }, { value: 'versus', label: 'Versus' }, { value: 'snacks', label: 'Snacks' }]} />
      {insights.isError && <p className="error" role="alert">{insights.error.message}</p>}
      {tab === 'overview' && selected && (
        <Overview members={members} selected={selected} meId={me?.id} onWho={setWho} meals={meals.data ?? []} />
      )}
      {tab === 'calendar' && selected && (
        <GoalCalendar userId={selected.user_id} who={<WhoToggle members={members} selected={selected} meId={me?.id} onWho={setWho} />} />
      )}
      {tab === 'versus' && members.length > 0 && <Versus members={members} meId={me?.id} />}
      {tab === 'snacks' && members.length > 0 && <SnacksInsights members={members} meId={me?.id} />}
    </>
  )
}

function WhoToggle({ members, selected, meId, onWho }: { members: MemberInsights[]; selected: MemberInsights; meId?: number; onWho: (id: number) => void }) {
  if (members.length < 2) return <span />
  return (
    <Toggle<string> variant="mini" label="Person" value={String(selected.user_id)} onChange={(v) => onWho(Number(v))}
      options={members.map((m) => ({ value: String(m.user_id), label: m.user_id === meId ? 'You' : m.name }))} />
  )
}

function Overview({ members, selected, meId, onWho, meals }: {
  members: MemberInsights[]
  selected: MemberInsights
  meId?: number
  onWho: (id: number) => void
  meals: MealCard[]
}) {
  const [range, setRange] = useState<Range>('week')
  const [back, setBack] = useState(0) // how many ranges back in time; 0 = up to today
  const today = todayISO()
  const len = RANGE_DAYS[range]
  const end = addDays(today, -back * len)
  const start = addDays(end, 1 - len)
  const data = useQuery({ queryKey: ['insights', end, len], queryFn: () => api.insights(end, len), placeholderData: keepPreviousData })
  const member = data.data?.members.find((m) => m.user_id === selected.user_id)
  const days = member?.days ?? []
  const g = selected.goals
  const split = macroSplit(days)
  const hits = days.filter((d) => fiberHit(d, g)).length
  const top = [...meals].filter((m) => m.score !== null).sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 3)
  const n = meals.length
  const swipe = useSwipe((dir) => setBack((b) => Math.max(0, b + (dir === 'right' ? 1 : -1))))
  const word = range === 'day' ? 'day' : range

  return (
    <>
      <div className="row" style={{ marginBottom: 8 }}>
        <WhoToggle members={members} selected={selected} meId={meId} onWho={onWho} />
        <span className="sp" />
        <Toggle<Range> variant="mini" label="Range" value={range} onChange={(r) => { setRange(r); setBack(0) }}
          options={[{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }]} />
      </div>
      <div className="period" role="group" aria-label="Period">
        <button className="icon" aria-label={`Earlier ${word}`} onClick={() => setBack(back + 1)}><Icon name="back" size={18} /></button>
        <b aria-live="polite">{rangeLabel(range, start, end, back)}</b>
        <button className="icon" aria-label={`Later ${word}`} disabled={back === 0} onClick={() => setBack(back - 1)}><Icon name="chev" size={18} /></button>
      </div>
      <div className="card" {...swipe}>
        <h3>Calories <span className="sub">avg {Math.round(avg(days, 'kcal'))} · goal {g.kcal}</span></h3>
        <BarChart
          label="Calories per day"
          color="var(--accent)"
          goal={g.kcal}
          goalLabel={`goal ${g.kcal}`}
          bars={days.map((d, i) => ({
            label: days.length === 1 ? rangeLabel('day', d.date, d.date, back) : range === 'month' ? ((days.length - 1 - i) % 7 ? '' : String(Number(d.date.slice(8)))) : weekdayOf(d.date),
            value: d.kcal,
            highlight: i === days.length - 1,
            title: `${d.date}: ${Math.round(d.kcal)} kcal`,
          }))}
        />
        <div className="sub" style={{ textAlign: 'center', marginTop: 4 }}>Swipe right for earlier, left for later</div>
      </div>
      <div className="card">
        <div className="sub" style={{ marginBottom: 8 }}>{range === 'day' ? 'Eaten that day' : 'Per day on average'}</div>
        <MacroTiles values={dailyAverage(days)} label="Average per day" />
        <Sources key={`${selected.user_id}-${end}-${len}`} userId={selected.user_id} end={end} days={len} />
      </div>
      <div className="card row">
        {split ? (
          <>
            <Donut segments={[{ value: split.protein, color: 'var(--p)' }, { value: split.carbs, color: 'var(--c)' }, { value: split.fat, color: 'var(--f)' }]} />
            <div className="sp" aria-label="Macro split">
              {([['Protein', split.protein, 'var(--p)'], ['Carbs', split.carbs, 'var(--c)'], ['Fat', split.fat, 'var(--f)']] as const).map(([name, v, c]) => (
                <div className="row" style={{ margin: '6px 0' }} key={name}>
                  <i style={{ width: 10, height: 10, borderRadius: 2, background: c }} />
                  <span className="sp">{name}</span>
                  <b>{Math.round(v)}%</b>
                </div>
              ))}
            </div>
          </>
        ) : <span className="sub">Log a meal to see your macro split.</span>}
      </div>
      {member && (
        <div className="macro" style={{ '--n': 4 } as CSSProperties} aria-label="Meals eaten">
          {(['breakfast', 'lunch', 'dinner', 'snack'] as const).map((t) => (
            <div key={t} className="mt">
              <Icon name={MEAL_TYPE_ICON[t]} size={18} />
              <b>{member.meal_counts[t] ?? 0}</b>
              <small>{MEALS_WORD[t]}</small>
            </div>
          ))}
        </div>
      )}
      <div className="card">
        <h3>Fiber goal ({g.fiber} g)</h3>
        <div className="row" style={{ margin: '10px 0', flexWrap: 'wrap', gap: range === 'month' ? 6 : undefined }} aria-hidden="true">
          {days.map((d) => (
            <span key={d.date} className={`chk${fiberHit(d, g) ? ' on' : ''}`} title={`${d.date}: ${Math.round(d.fiber)} g`}>
              {fiberHit(d, g) && <Icon name="check" size={16} />}
            </span>
          ))}
        </div>
        <div className="sub">{hits} of {days.length} days hit · avg {Math.round(avg(days, 'fiber'))} g</div>
      </div>
      {member && (
        <div className="card row" aria-label="Eating out">
          <span style={{ fontSize: 24 }} aria-hidden>🍽️</span>
          <div className="sp">
            {member.not_cooked.out || member.not_cooked.bought ? (
              <>
                <h3>Ate out {member.not_cooked.out}× · bought {member.not_cooked.bought}×</h3>
                <div className="sub">{member.not_cooked.spent > 0 ? `${member.not_cooked.spent.toFixed(2)} € paid this ${word}` : 'No prices noted'}</div>
              </>
            ) : <h3>Everything home-cooked this {word}</h3>}
          </div>
        </div>
      )}
      <div className="macro" style={{ '--n': 3 } as CSSProperties}>
        <div><b>{n ? (meals.reduce((a, m) => a + m.cost / m.portions, 0) / n).toFixed(2) : '–'} €</b><small>avg / portion</small></div>
        <div><b>{n ? Math.round(meals.reduce((a, m) => a + m.prep_minutes, 0) / n) : '–'} min</b><small>avg cook time</small></div>
        <div><b>{n}</b><small>meals logged</small></div>
      </div>
      {!!top.length && (
        <>
          <h2>Top rated</h2>
          <div className="card list">
            {top.map((m) => (
              <Link key={m.id} to={`/meals/${m.id}`} className="row" style={{ textDecoration: 'none' }}>
                <Photo url={m.photo_url} emoji={m.emoji} seed={m.id} alt="" style={{ width: 56, height: 56, aspectRatio: '1', fontSize: 28, flex: 'none' }} />
                <div className="sp"><h3>{m.name}</h3><div className="sub"><StarNum value={m.taste ?? 0} /></div></div>
              </Link>
            ))}
          </div>
        </>
      )}
    </>
  )
}

const MEALS_WORD = { breakfast: 'breakfasts', lunch: 'lunches', dinner: 'dinners', snack: 'snacks' } as const

const SOURCE_LABEL: Record<SourceGroup, string> = { protein: 'Protein', carbs: 'Carbs', fat: 'Fat', fiber: 'Fiber', sugar: 'Sugar' }

/** "Where it comes from": the ingredients eaten most often, under the nutrient they bring. */
function Sources({ userId, end, days }: { userId: number; end: string; days: number }) {
  const [open, setOpen] = useState(false)
  const [group, setGroup] = useState<SourceGroup>('protein')
  const sources = useQuery({ queryKey: ['insights', 'sources', userId, end, days], queryFn: () => api.insightSources(end, days, userId), enabled: open })
  const items = sources.data?.groups[group] ?? []
  return (
    <>
      <button className="textbtn row" style={{ justifyContent: 'center', gap: 6, textDecoration: 'none', marginTop: 8 }} aria-expanded={open} onClick={() => setOpen(!open)}>
        Where it comes from <Icon name="chev" size={14} />
      </button>
      {open && (
        <div aria-label="Where it comes from">
          <Toggle<SourceGroup> label="Nutrient" value={group} onChange={setGroup}
            options={(Object.keys(SOURCE_LABEL) as SourceGroup[]).map((k) => ({ value: k, label: SOURCE_LABEL[k] }))} />
          {sources.isError && <p className="error" role="alert">{sources.error.message}</p>}
          {sources.isSuccess && !items.length && <p className="sub">Nothing logged with {SOURCE_LABEL[group].toLowerCase()} yet.</p>}
          <div className="list">
            {items.map((i) => (
              <div key={i.name}>
                <span>{i.emoji}</span>
                <span className="sp">{i.name}</span>
                <span className="sub">{i.times}× · {i.grams} g</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}

/** Horizontal swipes on an element: right / left past 50 px, ignoring mostly vertical scrolls. */
function useSwipe(onSwipe: (dir: 'left' | 'right') => void) {
  const [from, setFrom] = useState<{ x: number; y: number } | null>(null)
  return {
    onTouchStart: (e: React.TouchEvent) => setFrom({ x: e.touches[0].clientX, y: e.touches[0].clientY }),
    onTouchEnd: (e: React.TouchEvent) => {
      if (!from) return
      const dx = e.changedTouches[0].clientX - from.x
      const dy = e.changedTouches[0].clientY - from.y
      setFrom(null)
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) onSwipe(dx > 0 ? 'right' : 'left')
    },
  }
}

function Versus({ members, meId }: { members: MemberInsights[]; meId?: number }) {
  const [challenge, setChallenge] = useState<Challenge>('fiber')
  if (members.length < 2) {
    return <div className="card sub">Versus starts once your partner joins. Share the invite code from Settings.</div>
  }
  const a = members.find((m) => m.user_id === meId) ?? members[0]
  const b = members.find((m) => m !== a)!
  const { rows, points } = versus(a, b)
  const lead = points.a === points.b ? 'All square' : points.a > points.b ? 'You lead' : `${b.name} leads`
  const ch = CHALLENGES[challenge]

  return (
    <>
      <div className="card" style={{ textAlign: 'center' }}>
        <div className="sub">This week</div>
        <div className="row" style={{ justifyContent: 'center', gap: 22, marginTop: 6 }}>
          <div><Avatar name={a.name} color={a.color} /><div style={{ fontSize: 30, fontWeight: 650 }} aria-label="Your points">{points.a}</div></div>
          <div className="sub">vs</div>
          <div><Avatar name={b.name} color={b.color} /><div style={{ fontSize: 30, fontWeight: 650 }} aria-label={`${b.name}'s points`}>{points.b}</div></div>
        </div>
        <div className="sub" style={{ marginTop: 4 }}>{lead} · {rows.length} categories</div>
      </div>
      <div className="card">
        {rows.map((r) => (
          <div className="vs" key={r.label}>
            <div className={`v${r.winner === 'a' ? ' win' : ''}`}>{r.winner === 'a' && <><Icon name="trophy" size={14} /> </>}{r.a}</div>
            <div className="sub" style={{ textAlign: 'center' }}>{r.label}</div>
            <div className={`v${r.winner === 'b' ? ' win' : ''}`} style={{ textAlign: 'right' }}>{r.b}{r.winner === 'b' && <> <Icon name="trophy" size={14} /></>}</div>
          </div>
        ))}
      </div>
      <h2>Weekly challenge</h2>
      <div className="chips" style={{ marginBottom: 10 }} role="group" aria-label="Challenge">
        {(Object.keys(CHALLENGES) as Challenge[]).map((k) => (
          <button key={k} className={`chip${challenge === k ? ' on' : ''}`} aria-pressed={challenge === k} onClick={() => setChallenge(k)}>
            {CHALLENGES[k].name}
          </button>
        ))}
      </div>
      <div className="card">
        <h3>{ch.name}</h3>
        <div className="sub" style={{ marginBottom: 10 }}>{ch.describe(a.goals)}</div>
        {[a, b].map((m) => {
          const p = challengeProgress(m, challenge)
          return (
            <div className="row" style={{ margin: '8px 0' }} key={m.user_id}>
              <Avatar name={m.name} color={m.color} size={28} />
              <div className="bar sp"><i style={{ width: `${Math.min((p / CHALLENGE_TARGET) * 100, 100)}%`, background: m.color }} /></div>
              <b>{p}/{CHALLENGE_TARGET}</b>
            </div>
          )
        })}
      </div>
    </>
  )
}
