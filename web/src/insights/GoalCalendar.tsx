import { useQuery } from '@tanstack/react-query'
import { type ReactNode, useState } from 'react'
import { api } from '../api/client'
import { todayISO } from '../lib/dates'
import { dayStatus, GOALS, type GoalKey, monthEnd, monthGrid, streak } from '../lib/goalCalendar'
import { Icon } from '../ui/Icon'
import { Toggle } from '../ui/Toggle'

const SPAN = 92 // the API's maximum: a full month plus enough history for the streak
const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const days = (n: number) => `${n} day${n === 1 ? '' : 's'}`
const STATUS_LABEL = { hit: 'goal hit', miss: 'missed', empty: 'nothing logged', future: 'upcoming' } as const

/** Month calendar of the days a person hit one of their goals (Insights → Calendar). */
export function GoalCalendar({ userId, who }: { userId?: number; who: ReactNode }) {
  const today = todayISO()
  const [ty, tm] = today.split('-').map(Number)
  const [month, setMonth] = useState({ y: ty, m: tm - 1 })
  const [goal, setGoal] = useState<GoalKey>('kcal')
  const [picked, setPicked] = useState<string | null>(null)
  const end = monthEnd(month.y, month.m, today)
  const q = useQuery({ queryKey: ['insights', end, SPAN], queryFn: () => api.insights(end, SPAN) })
  const member = q.data?.members.find((m) => m.user_id === userId) ?? q.data?.members[0]
  const byDate = new Map(member?.days.map((d) => [d.date, d]))
  const isCurrent = month.y === ty && month.m === tm - 1
  const step = (by: number) => {
    const d = new Date(month.y, month.m + by, 1)
    setMonth({ y: d.getFullYear(), m: d.getMonth() })
    setPicked(null)
  }
  const title = new Date(month.y, month.m, 1).toLocaleDateString('en', { month: 'long', year: 'numeric' })
  const inMonth = member?.days.filter((d) => d.date.startsWith(end.slice(0, 7))) ?? []
  const hits = member ? inMonth.filter((d) => dayStatus(d, goal, member.goals, today, d.date) === 'hit').length : 0
  const loggedDays = inMonth.filter((d) => d.kcal > 0).length
  const pickedDay = picked ? byDate.get(picked) : undefined

  return (
    <>
      <div className="row" style={{ marginBottom: 12 }}>
        {who}
        <span className="sp" />
      </div>
      <Toggle<GoalKey> label="Goal" value={goal} onChange={setGoal}
        options={(Object.keys(GOALS) as GoalKey[]).map((k) => ({ value: k, label: GOALS[k].label }))} />
      {q.isError && <p className="error" role="alert">{q.error.message}</p>}
      <div className="card">
        <div className="row" style={{ marginBottom: 8 }}>
          <button className="icon" aria-label="Previous month" onClick={() => step(-1)}><Icon name="back" /></button>
          <h3 className="sp" style={{ textAlign: 'center' }}>{title}</h3>
          <button className="icon" aria-label="Next month" disabled={isCurrent} onClick={() => step(1)}><Icon name="chev" /></button>
        </div>
        <div className="gcal" role="grid" aria-label={`${GOALS[goal].label} goal, ${title}`}>
          <div role="row" className="gcal-row">
            {WEEKDAYS.map((w, i) => <span role="columnheader" key={i} className="gcal-wd">{w}</span>)}
          </div>
          {monthGrid(month.y, month.m).map((week, i) => (
            <div role="row" className="gcal-row" key={i}>
              {week.map((date, j) => {
                if (!date) return <span role="gridcell" key={j} />
                const st = member ? dayStatus(byDate.get(date), goal, member.goals, today, date) : 'empty'
                return (
                  <span role="gridcell" key={j}>
                    <button
                      className={`gcal-day ${st}${date === today ? ' today' : ''}`}
                      aria-label={`${date}: ${STATUS_LABEL[st]}`}
                      aria-pressed={picked === date}
                      disabled={st === 'future'}
                      onClick={() => setPicked(picked === date ? null : date)}
                    >
                      {Number(date.slice(8))}
                    </button>
                  </span>
                )
              })}
            </div>
          ))}
        </div>
        {member && (
          <div className="sub" style={{ marginTop: 10 }}>
            {picked
              ? `${new Date(`${picked}T12:00`).toLocaleDateString('en', { weekday: 'short', day: 'numeric', month: 'short' })}: ${pickedDay && pickedDay.kcal > 0 ? `${GOALS[goal].value(pickedDay)} · ${STATUS_LABEL[dayStatus(pickedDay, goal, member.goals, today, picked)]}` : 'nothing logged'}`
              : `${GOALS[goal].describe(member.goals)} · ${hits} of ${loggedDays} logged days`}
          </div>
        )}
      </div>
      {member && isCurrent && (
        <div className="card row">
          <Icon name="trophy" />
          <span className="sp">Current streak</span>
          <b aria-label="Current streak">{days(streak(member.days, goal, member.goals, today))}</b>
        </div>
      )}
    </>
  )
}
