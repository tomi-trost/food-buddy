import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../api/client'
import type { LearnedFamily } from '../api/types'
import { Sheet } from '../ui/Sheet'
import { useToast } from '../ui/Toast'
import { FamilyLearned } from './FamilyLearned'

/** A family's settings: its name (renaming moves every dish in it, guessed ones too) and, for
 *  families we made, the words and ingredients it matches new meals on. */
export function FamilySettings({ family, dishes, learned, open, onClose, onRenamed }: {
  family: string
  dishes: number
  learned?: LearnedFamily
  open: boolean
  onClose: () => void
  onRenamed: (to: string) => void
}) {
  return (
    <Sheet open={open} onClose={onClose} label="Family settings">
      {open && <SettingsForm family={family} dishes={dishes} learned={learned} onClose={onClose} onRenamed={onRenamed} />}
    </Sheet>
  )
}

function SettingsForm({ family, dishes, learned, onClose, onRenamed }: {
  family: string
  dishes: number
  learned?: LearnedFamily
  onClose: () => void
  onRenamed: (to: string) => void
}) {
  const qc = useQueryClient()
  const toast = useToast()
  const [name, setName] = useState(family)
  const rename = useMutation({
    mutationFn: () => api.renameFamily(family, name.trim()),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['meals'] })
      qc.invalidateQueries({ queryKey: ['families'] })
      onRenamed(r.name)
      onClose()
      toast(`Renamed to ${r.name}`)
    },
  })
  const changed = name.trim() !== '' && name.trim() !== family

  return (
    <>
      <h1>{family}</h1>
      <div className="sub" style={{ marginBottom: 14 }}>{dishes === 1 ? '1 dish' : `${dishes} dishes`} in this family</div>
      <label className="field" style={{ marginBottom: 6 }}>
        Name
        <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && changed) rename.mutate() }} />
      </label>
      <div className="sub" style={{ marginBottom: 10 }}>
        Renaming moves all its dishes{learned ? '' : ' and makes the family ours: it then learns from them'}. A name we already use joins the two.
      </div>
      {rename.isError && <p className="error" role="alert">{rename.error.message}</p>}
      <button className="btn" disabled={!changed || rename.isPending} onClick={() => rename.mutate()}>
        {rename.isPending ? 'Renaming…' : 'Rename'}
      </button>

      <h2>What it matches</h2>
      {learned ? <FamilyLearned family={learned} /> : (
        <p className="sub">Grouped by our built-in rules (its dishes’ names and main ingredients). Pick it for a meal in Edit meal, or rename it, and it learns from your picks.</p>
      )}
      <button className="btn ghost" style={{ marginTop: 16 }} onClick={onClose}>Done</button>
    </>
  )
}
