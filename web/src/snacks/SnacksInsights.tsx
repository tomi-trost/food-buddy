import { useQuery } from '@tanstack/react-query'
import { type CSSProperties, useState } from 'react'
import { api } from '../api/client'
import type { MemberInsights } from '../api/types'
import { todayISO } from '../lib/dates'
import { isTreat, KIND_LABEL } from '../lib/snacks'
import { Avatar } from '../ui/Avatar'
import { BarChart } from '../ui/charts'
import { Icon } from '../ui/Icon'
import { Toggle } from '../ui/Toggle'

const WEEKDAY = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const weekdayOf = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return WEEKDAY[new Date(y, m - 1, d).getDay()]
}

const treatFree = (m: MemberInsights) => m.days.filter((d) => d.kcal > 0 && d.treats === 0).length
const treats = (m: MemberInsights) => m.days.reduce((a, d) => a + d.treats, 0)
const overGoal = (m: MemberInsights) => m.days.filter((d) => d.treat_sugar > m.goals.sugar).length

export function SnacksInsights({ members, meId }: { members: MemberInsights[]; meId?: number }) {
  const today = todayISO()
  const [who, setWho] = useState(meId ?? members[0].user_id)
  const selected = members.find((m) => m.user_id === who) ?? members[0]
  const rewards = useQuery({ queryKey: ['rewards', today], queryFn: () => api.rewards(today) })
  const day = useQuery({ queryKey: ['day', today], queryFn: () => api.day(today) })
  const household = useQuery({ queryKey: ['me'], queryFn: api.me }).data?.household
  const goal = selected.goals.sugar
  const mineToday = (day.data?.entries ?? []).filter((e) => e.kind === 'snack')
  const [a, b] = [members.find((m) => m.user_id === meId) ?? members[0], members.find((m) => m.user_id !== meId)]

  return (
    <>
      {members.length > 1 && (
        <div style={{ marginBottom: 12 }}>
          <Toggle<string> variant="mini" label="Person" value={String(selected.user_id)} onChange={(v) => setWho(Number(v))}
            options={members.map((m) => ({ value: String(m.user_id), label: m.user_id === meId ? 'You' : m.name }))} />
        </div>
      )}
      <div className="card">
        <h3 className="row" style={{ gap: 6 }}>
          <span style={{ color: 'var(--sg)', display: 'flex' }}><Icon name="cube" size={18} /></span>
          Sugar from treats <span className="sub">goal {goal} g / day</span>
        </h3>
        <BarChart
          label="Treat sugar per day"
          color="var(--sg)"
          goal={goal}
          goalLabel={`goal ${goal} g`}
          height={130}
          bars={selected.days.map((d) => ({
            label: weekdayOf(d.date),
            value: d.treat_sugar,
            highlight: true,
            title: `${d.date}: ${Math.round(d.treat_sugar)} g treat sugar${d.treat_sugar > goal ? ' (over goal)' : ''}`,
          }))}
        />
      </div>
      <div className="macro" style={{ '--n': 3 } as CSSProperties} aria-label="Treat stats">
        <div><b>{treatFree(selected)}</b><small>treat-free days</small></div>
        <div><b>{treats(selected)}</b><small>treats this week</small></div>
        <div><b>{overGoal(selected)}</b><small>days over goal</small></div>
      </div>

      <h2>Croissant rewards</h2>
      <div className="card">
        {household && (
          <div className="sub" style={{ marginBottom: 10 }}>
            Every {household.reward_per} treat-free days earns a croissant from a shop (max {household.reward_cap} a week).
          </div>
        )}
        {(rewards.data ?? []).map((r) => (
          <div className="row" style={{ margin: '8px 0' }} key={r.user_id}>
            <Avatar name={r.name} color={r.color} size={30} />
            <div className="row sp" style={{ gap: 5 }} aria-label={`${r.name}: ${r.progress} of ${r.per} days`}>
              {Array.from({ length: r.per }, (_, i) => (
                <span key={i} className={`chk${i < r.progress ? ' on' : ''}`}>{i < r.progress && <Icon name="check" size={16} />}</span>
              ))}
            </div>
            <span className="sub" style={{ display: 'flex', alignItems: 'center', gap: 5, color: r.available ? 'var(--accent)' : undefined }}>
              <Icon name="gift" size={16} /> {r.available} ready · {r.used} used
            </span>
          </div>
        ))}
      </div>

      <h2>Today</h2>
      <div className="card">
        {selected.user_id !== meId ? (
          <span className="sub">{selected.days[selected.days.length - 1].treats} treats today</span>
        ) : mineToday.length ? (
          <div className="list">
            {mineToday.map((e) => (
              <div key={e.id}>
                <span style={{ fontSize: 22 }}>{e.emoji}</span>
                <span className="sp">{e.name}</span>
                <span className="sub">
                  {e.is_reward ? 'reward' : `${KIND_LABEL[e.snack_kind ?? 'sweet']}${isTreat(e) ? ` · ${Math.round(e.nutrients.sugar)} g sugar` : ''}`}
                </span>
              </div>
            ))}
          </div>
        ) : <span className="sub">Nothing yet — nice.</span>}
      </div>

      {b && (
        <>
          <h2>Who resists better?</h2>
          <div className="card">
            <div className="vs">
              <div className={`v${treatFree(a) >= treatFree(b) ? ' win' : ''}`}>{treatFree(a)}</div>
              <div className="sub" style={{ textAlign: 'center' }}>treat-free days</div>
              <div className={`v${treatFree(b) >= treatFree(a) ? ' win' : ''}`} style={{ textAlign: 'right' }}>{treatFree(b)}</div>
            </div>
            <div className="vs">
              <div className={`v${treats(a) <= treats(b) ? ' win' : ''}`}>{treats(a)}</div>
              <div className="sub" style={{ textAlign: 'center' }}>sweets (fewer wins)</div>
              <div className={`v${treats(b) <= treats(a) ? ' win' : ''}`} style={{ textAlign: 'right' }}>{treats(b)}</div>
            </div>
          </div>
        </>
      )}
    </>
  )
}
