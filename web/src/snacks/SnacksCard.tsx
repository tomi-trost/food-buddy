import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../api/client'
import type { LogEntry, Me } from '../api/types'
import { todayISO } from '../lib/dates'
import { treatSugarToday } from '../lib/snacks'
import { ProgressBar } from '../ui/charts'
import { Icon } from '../ui/Icon'
import { useToast } from '../ui/Toast'
import { LogSnackSheet } from './LogSnackSheet'

export function SnacksCard({ me, entries }: { me: Me; entries: LogEntry[] }) {
  const qc = useQueryClient()
  const toast = useToast()
  const today = todayISO()
  const [logging, setLogging] = useState(false)
  const rewards = useQuery({ queryKey: ['rewards', today], queryFn: () => api.rewards(today) })
  const mine = rewards.data?.find((r) => r.user_id === me.id)
  const use = useMutation({
    mutationFn: () => api.useReward(today),
    onSuccess: (r) => {
      qc.setQueryData(['rewards', today], r)
      qc.invalidateQueries({ queryKey: ['day'] })
      qc.invalidateQueries({ queryKey: ['insights'] })
      toast('Enjoy your croissant!')
    },
  })
  const { snacks, sugar } = treatSugarToday(entries)
  const goal = me.goals.sugar
  const over = sugar > goal

  return (
    <>
      <h2>Snacks</h2>
      <div className="card">
        <div className="row">
          <span style={{ color: 'var(--sg)', display: 'flex' }}><Icon name="cube" size={26} /></span>
          <div className="sp">
            <h3>{snacks} snack{snacks === 1 ? '' : 's'} today · {Math.round(sugar)} g treat sugar</h3>
            <div className="sub">{over ? `Over your ${goal} g goal` : `Treat sugar goal ${goal} g`}</div>
          </div>
          <button className="btn sm ghost" onClick={() => setLogging(true)}><Icon name="plus" size={16} /> Log</button>
        </div>
        <div style={{ marginTop: 10 }}>
          <ProgressBar pct={goal ? (sugar / goal) * 100 : 0} color={over ? 'var(--bad)' : 'var(--sg)'} />
        </div>
        {mine && (
          <div className="row" style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
            <span style={{ display: 'flex', color: 'var(--accent)' }}><Icon name="gift" size={20} /></span>
            <div className="sp">
              <b style={{ fontSize: 14 }}>Croissant pass</b>
              <div className="sub">
                {mine.available
                  ? `${mine.available} available — you earned it`
                  : `${mine.progress} / ${mine.per} treat-free days to the next one`}
              </div>
            </div>
            {mine.available > 0 && <button className="btn sm" disabled={use.isPending} onClick={() => use.mutate()}>Use pass</button>}
          </div>
        )}
      </div>
      <LogSnackSheet open={logging} onClose={() => setLogging(false)} />
    </>
  )
}
