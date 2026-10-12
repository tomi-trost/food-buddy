import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { api } from '../api/client'
import type { CatalogItem, Nutrients } from '../api/types'
import { todayISO } from '../lib/dates'
import { KIND_LABEL } from '../lib/snacks'
import { Icon } from '../ui/Icon'
import { Sheet } from '../ui/Sheet'
import { useToast } from '../ui/Toast'
import { SnackAmount } from './SnackAmount'

export function LogSnackSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} label="Log a snack">
      <LogSnack onClose={onClose} /> {/* fresh on each open */}
    </Sheet>
  )
}

type Draft = { item: CatalogItem; amount: number; perUnit: Nutrients }

function LogSnack({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const navigate = useNavigate()
  const catalog = useQuery({ queryKey: ['snack-catalog'], queryFn: api.snackCatalog, staleTime: Infinity })
  const [draft, setDraft] = useState<Draft | null>(null) // picked: confirm amount and values first
  const [valid, setValid] = useState(true)
  const log = useMutation({
    mutationFn: ({ item, amount, perUnit }: Draft) =>
      api.logSnack({
        eaten_on: todayISO(), name: item.name, emoji: item.emoji, kind: item.kind, source: 'list',
        per: 'piece', amount, per_unit: perUnit,
      }),
    onSuccess: (logged) => {
      qc.invalidateQueries({ queryKey: ['day'] })
      qc.invalidateQueries({ queryKey: ['insights'] })
      onClose()
      toast(`${logged.name} logged${logged.treat ? ` · ${Math.round(logged.sugar)} g treat sugar` : ''}`)
    },
  })

  if (draft) {
    return (
      <>
        <h1>{draft.item.emoji} {draft.item.name}</h1>
        <div className="sub" style={{ marginBottom: 12 }}>Typical values. Change them if yours was different.</div>
        <SnackAmount per="piece" amount={draft.amount} perUnit={draft.perUnit}
          onAmount={(amount) => setDraft({ ...draft, amount })} onPerUnit={(perUnit) => setDraft({ ...draft, perUnit })} onValid={setValid} />
        {log.isError && <p className="error" role="alert">{log.error.message}</p>}
        <button className="btn" disabled={log.isPending || !valid} onClick={() => log.mutate(draft)}>Log snack</button>
        <button className="btn ghost" style={{ marginTop: 8 }} onClick={() => setDraft(null)}>Pick another</button>
      </>
    )
  }

  return (
    <>
      <h1>Log a snack</h1>
      <div className="sub" style={{ marginBottom: 12 }}>
        Sweets and sugary drinks count as treats for your streak and croissant rewards. Savory snacks only add to your macros.
      </div>
      <div className="row" style={{ gap: 8 }}>
        <button className="btn ghost" onClick={() => navigate('/snap?kind=snack')}><Icon name="camera" size={18} /> Photo</button>
        <button className="btn ghost" onClick={() => navigate('/snap?kind=label')}><Icon name="plan" size={18} /> Scan label</button>
      </div>
      <h2>Or pick one</h2>
      <div className="list">
        {(catalog.data ?? []).map((item) => (
          <button key={item.key} style={{ width: '100%', textAlign: 'left' }} disabled={log.isPending} onClick={() => {
            setValid(true)
            setDraft({ item, amount: 1, perUnit: item.per_unit })
          }}>
            <span style={{ fontSize: 24 }}>{item.emoji}</span>
            <span className="sp">{item.name}<div className="sub">{KIND_LABEL[item.kind]}</div></span>
            <span className="sub">{item.per_unit.sugar} g sugar · {item.per_unit.kcal} kcal</span>
          </button>
        ))}
      </div>
    </>
  )
}
