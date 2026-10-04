import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { api } from '../api/client'
import type { CatalogItem } from '../api/types'
import { todayISO } from '../lib/dates'
import { KIND_LABEL } from '../lib/snacks'
import { Icon } from '../ui/Icon'
import { Sheet } from '../ui/Sheet'
import { useToast } from '../ui/Toast'

export function LogSnackSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const navigate = useNavigate()
  const catalog = useQuery({ queryKey: ['snack-catalog'], queryFn: api.snackCatalog, enabled: open, staleTime: Infinity })
  const log = useMutation({
    mutationFn: (item: CatalogItem) =>
      api.logSnack({
        eaten_on: todayISO(), name: item.name, emoji: item.emoji, kind: item.kind, source: 'list',
        per: 'piece', amount: 1, per_unit: item.per_unit,
      }),
    onSuccess: (logged) => {
      qc.invalidateQueries({ queryKey: ['day'] })
      qc.invalidateQueries({ queryKey: ['insights'] })
      onClose()
      toast(`${logged.name} logged${logged.treat ? ` · ${Math.round(logged.sugar)} g treat sugar` : ''}`)
    },
  })

  return (
    <Sheet open={open} onClose={onClose} label="Log a snack">
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
          <button key={item.key} style={{ width: '100%', textAlign: 'left' }} disabled={log.isPending} onClick={() => log.mutate(item)}>
            <span style={{ fontSize: 24 }}>{item.emoji}</span>
            <span className="sp">{item.name}<div className="sub">{KIND_LABEL[item.kind]}</div></span>
            <span className="sub">{item.per_unit.sugar} g sugar · {item.per_unit.kcal} kcal</span>
          </button>
        ))}
      </div>
      {log.isError && <p className="error" role="alert">{log.error.message}</p>}
    </Sheet>
  )
}
