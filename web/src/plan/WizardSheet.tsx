import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { WizardCell } from '../api/types'
import { MEAL_TYPE_SHORT, todayISO } from '../lib/dates'
import { cellLabel, DAY_NAMES, defaultWizard, nextOption, weekStart } from '../lib/plan'
import { Sheet } from '../ui/Sheet'
import { Toggle } from '../ui/Toggle'

export function WizardSheet({ open, onClose, initial }: { open: boolean; onClose: () => void; initial?: WizardCell[][] }) {
  const qc = useQueryClient()
  const [grid, setGrid] = useState<WizardCell[][]>(defaultWizard)
  const [week, setWeek] = useState<'this' | 'next'>('next')
  useEffect(() => {
    if (open) setGrid(initial ? initial.map((r) => r.map((c) => ({ ...c }))) : defaultWizard())
  }, [open, initial])

  const generate = useMutation({
    mutationFn: () => api.makePlan(weekStart(todayISO(), week), grid),
    onSuccess: (plan) => {
      qc.setQueryData(['plan'], plan)
      qc.invalidateQueries({ queryKey: ['shopping'] })
      onClose()
    },
  })

  return (
    <Sheet open={open} onClose={onClose} label="Plan the week">
      <h1 style={{ fontSize: 20 }}>Plan the week</h1>
      <p className="sub" style={{ margin: '4px 0 10px', fontSize: 12 }}>
        Tap a cell to cycle: cook time → Prep (batch) → Out → – (skip)
      </p>
      <Toggle<'this' | 'next'> variant="mini" label="Which week" value={week} onChange={setWeek}
        options={[{ value: 'this', label: 'This week' }, { value: 'next', label: 'Next week' }]} />
      <div className="wgrid" style={{ marginTop: 10 }}>
        <span />
        {(['breakfast', 'lunch', 'dinner'] as const).map((t) => <span key={t} className="hd">{MEAL_TYPE_SHORT[t]}</span>)}
        {grid.map((row, d) => (
          <Row key={d} day={DAY_NAMES[d]} row={row} onTap={(t) =>
            setGrid((g) => g.map((r, i) => (i === d ? r.map((c, j) => (j === t ? nextOption(c) : c)) : r)))} />
        ))}
      </div>
      {generate.isError && <p className="error" role="alert">{generate.error.message}</p>}
      <button className="btn" style={{ marginTop: 12 }} disabled={generate.isPending} onClick={() => generate.mutate()}>
        Generate menu
      </button>
    </Sheet>
  )
}

function Row({ day, row, onTap }: { day: string; row: WizardCell[]; onTap: (t: number) => void }) {
  return (
    <>
      <b className="sub">{day}</b>
      {row.map((cell, t) => (
        <button key={t} className={`cell ${cell.mode}`} aria-label={`${day} ${['breakfast', 'lunch', 'dinner'][t]}: ${cellLabel(cell)}`} onClick={() => onTap(t)}>
          {cellLabel(cell)}
        </button>
      ))}
    </>
  )
}
