import { useQuery } from '@tanstack/react-query'
import { type CSSProperties, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { api } from '../api/client'
import { useMe } from '../api/hooks'
import type { MealCard, MemberInsights } from '../api/types'
import { todayISO } from '../lib/dates'
import { avg, CHALLENGE_TARGET, CHALLENGES, type Challenge, challengeProgress, fiberHit, macroSplit, versus } from '../lib/insights'
import { Avatar } from '../ui/Avatar'
import { BarChart, Donut } from '../ui/charts'
import { Icon } from '../ui/Icon'
import { Photo } from '../ui/Photo'
import { StarNum } from '../ui/Stars'
import { Toggle } from '../ui/Toggle'

type Tab = 'overview' | 'versus' | 'snacks'
const WEEKDAY = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const weekdayOf = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return WEEKDAY[new Date(y, m - 1, d).getDay()]
}

export function InsightsPage() {
  const navigate = useNavigate()
  const me = useMe().data
  const today = todayISO()
  const [tab, setTab] = useState<Tab>('overview')
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
        options={[{ value: 'overview', label: 'Overview' }, { value: 'versus', label: 'Versus' }, { value: 'snacks', label: 'Snacks' }]} />
      {insights.isError && <p className="error" role="alert">{insights.error.message}</p>}
      {tab === 'overview' && selected && (
        <Overview members={members} selected={selected} meId={me?.id} onWho={setWho} meals={meals.data ?? []} />
      )}
      {tab === 'versus' && members.length > 0 && <Versus members={members} meId={me?.id} />}
      {tab === 'snacks' && <div className="card sub">Coming in S7.</div>}
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
  const [range, setRange] = useState<'day' | 'week'>('week')
  const days = range === 'day' ? selected.days.slice(-1) : selected.days
  const g = selected.goals
  const split = macroSplit(days)
  const hits = days.filter((d) => fiberHit(d, g)).length
  const top = [...meals].filter((m) => m.score !== null).sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 3)
  const n = meals.length

  return (
    <>
      <div className="row" style={{ marginBottom: 12 }}>
        <WhoToggle members={members} selected={selected} meId={meId} onWho={onWho} />
        <span className="sp" />
        <Toggle<'day' | 'week'> variant="mini" label="Range" value={range} onChange={setRange}
          options={[{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }]} />
      </div>
      <div className="card">
        <h3>Calories <span className="sub">avg {Math.round(avg(days, 'kcal'))} · goal {g.kcal}</span></h3>
        <BarChart
          label="Calories per day"
          color="var(--accent)"
          goal={g.kcal}
          goalLabel={`goal ${g.kcal}`}
          bars={days.map((d, i) => ({
            label: days.length === 1 ? 'Today' : weekdayOf(d.date),
            value: d.kcal,
            highlight: i === days.length - 1,
            title: `${d.date}: ${Math.round(d.kcal)} kcal`,
          }))}
        />
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
      <div className="card">
        <h3>Fiber goal ({g.fiber} g)</h3>
        <div className="row" style={{ margin: '10px 0' }} aria-hidden="true">
          {days.map((d) => (
            <span key={d.date} className={`chk${fiberHit(d, g) ? ' on' : ''}`} title={`${d.date}: ${Math.round(d.fiber)} g`}>
              {fiberHit(d, g) && <Icon name="check" size={16} />}
            </span>
          ))}
        </div>
        <div className="sub">{hits} of {days.length} days hit · avg {Math.round(avg(days, 'fiber'))} g</div>
      </div>
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
                <div className="sp"><h3>{m.name}</h3><div className="sub"><StarNum value={m.score ?? 0} /></div></div>
              </Link>
            ))}
          </div>
        </>
      )}
    </>
  )
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
