import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { PhotoInput } from '../add/PhotoInput'
import { useFoodUpload } from '../add/upload'
import { api } from '../api/client'
import type { Nutrients, SavedSnack, SnackKind } from '../api/types'
import { todayISO } from '../lib/dates'
import { KIND_LABEL } from '../lib/snacks'
import { Icon } from '../ui/Icon'
import { Photo } from '../ui/Photo'
import { Sheet } from '../ui/Sheet'
import { useToast } from '../ui/Toast'
import { SnackAmount } from './SnackAmount'

export const SAVED_SNACKS = ['saved-snacks']

/** Log a snack: one of ours, a typical one from the list, or a new photo/label.
 *  With `saved` it opens straight on that snack (from Meals → Snacks). */
export function LogSnackSheet({ open, onClose, saved }: { open: boolean; onClose: () => void; saved?: SavedSnack }) {
  return (
    <Sheet open={open} onClose={onClose} label="Log a snack">
      <LogSnack onClose={onClose} saved={saved} /> {/* fresh on each open */}
    </Sheet>
  )
}

type Draft = {
  name: string
  emoji: string
  kind: SnackKind
  per: 'piece' | '100g'
  amount: number
  perUnit: Nutrients
  saved?: SavedSnack
}

const fromSaved = (s: SavedSnack): Draft => ({
  name: s.name, emoji: s.emoji, kind: s.kind, per: s.per, amount: s.amount, perUnit: s.per_unit, saved: s,
})

function LogSnack({ onClose, saved }: { onClose: () => void; saved?: SavedSnack }) {
  const qc = useQueryClient()
  const toast = useToast()
  const upload = useFoodUpload(onClose)
  const catalog = useQuery({ queryKey: ['snack-catalog'], queryFn: api.snackCatalog, staleTime: Infinity })
  const ours = useQuery({ queryKey: SAVED_SNACKS, queryFn: api.savedSnacks })
  const [draft, setDraft] = useState<Draft | null>(saved ? fromSaved(saved) : null) // picked: confirm amount and values first
  const [valid, setValid] = useState(true)
  const log = useMutation({
    mutationFn: (d: Draft) =>
      api.logSnack({
        eaten_on: todayISO(), name: d.name, emoji: d.emoji, kind: d.kind, source: d.saved ? 'saved' : 'list',
        per: d.per, amount: d.amount, per_unit: d.perUnit, saved_id: d.saved?.id,
      }),
    onSuccess: (logged) => {
      qc.invalidateQueries({ queryKey: ['day'] })
      qc.invalidateQueries({ queryKey: ['insights'] })
      qc.invalidateQueries({ queryKey: SAVED_SNACKS })
      onClose()
      toast(`${logged.name} logged${logged.treat ? ` · ${Math.round(logged.sugar)} g treat sugar` : ''}`)
    },
  })
  const remove = useMutation({
    mutationFn: (s: SavedSnack) => api.deleteSavedSnack(s.id),
    onSuccess: (_, s) => {
      qc.invalidateQueries({ queryKey: SAVED_SNACKS })
      onClose()
      toast(`${s.name} removed from our snacks`)
    },
  })

  if (draft) {
    return (
      <>
        <div className="row" style={{ gap: 12 }}>
          {draft.saved?.photo_url && (
            <Photo url={draft.saved.photo_url} emoji={draft.emoji} alt="" style={{ width: 56, height: 56, aspectRatio: '1', flex: 'none' }} />
          )}
          <h1 className="sp">{draft.saved?.photo_url ? '' : `${draft.emoji} `}{draft.name}</h1>
        </div>
        <div className="sub" style={{ marginBottom: 12 }}>
          {draft.saved ? 'Your values from last time. Change them if this one was different.' : 'Typical values. Change them if yours was different.'}
        </div>
        <SnackAmount per={draft.per} amount={draft.amount} perUnit={draft.perUnit}
          onAmount={(amount) => setDraft({ ...draft, amount })} onPerUnit={(perUnit) => setDraft({ ...draft, perUnit })} onValid={setValid} />
        {(log.error ?? remove.error) && <p className="error" role="alert">{(log.error ?? remove.error)!.message}</p>}
        <button className="btn" disabled={log.isPending || !valid} onClick={() => log.mutate(draft)}>Log snack</button>
        {!saved && <button className="btn ghost" style={{ marginTop: 8 }} onClick={() => setDraft(null)}>Pick another</button>}
        {draft.saved && (
          <button className="textbtn" style={{ marginTop: 12 }} disabled={remove.isPending} onClick={() => remove.mutate(draft.saved!)}>
            Remove from our snacks
          </button>
        )}
      </>
    )
  }

  const pick = (d: Draft) => {
    setValid(true)
    setDraft(d)
  }
  return (
    <>
      <h1>Log a snack</h1>
      <div className="sub" style={{ marginBottom: 12 }}>
        Sweets and sugary drinks count as treats for your streak and croissant rewards. Savory snacks only add to your macros.
      </div>
      <div className="row" style={{ gap: 8 }}>
        <PhotoInput camera label="Snack photo" disabled={upload.busy} className="btn ghost"
          onFile={(file) => upload.photo.mutate({ file, kind: 'snack' })}>
          <Icon name="camera" size={18} /> Photo
        </PhotoInput>
        <PhotoInput camera label="Scan label" disabled={upload.busy} className="btn ghost"
          onFile={(file) => upload.photo.mutate({ file, kind: 'label' })}>
          <Icon name="tag" size={18} /> Scan label
        </PhotoInput>
      </div>
      {!!ours.data?.length && (
        <>
          <h2>Our snacks</h2>
          <div className="list" aria-label="Our snacks">
            {ours.data.map((s) => (
              <button key={s.id} style={{ width: '100%', textAlign: 'left' }} disabled={log.isPending} onClick={() => pick(fromSaved(s))}>
                <Photo url={s.photo_url} emoji={s.emoji} seed={s.id} alt="" style={{ width: 36, height: 36, aspectRatio: '1', fontSize: 20, flex: 'none' }} />
                <span className="sp">{s.name}<div className="sub">{KIND_LABEL[s.kind]}</div></span>
                <span className="sub">{Math.round(s.per_unit.kcal)} kcal / {s.per === 'piece' ? 'piece' : '100 g'}</span>
              </button>
            ))}
          </div>
        </>
      )}
      <h2>Or pick one</h2>
      <div className="list">
        {(catalog.data ?? []).map((item) => (
          <button key={item.key} style={{ width: '100%', textAlign: 'left' }} disabled={log.isPending}
            onClick={() => pick({ name: item.name, emoji: item.emoji, kind: item.kind, per: 'piece', amount: 1, perUnit: item.per_unit })}>
            <span style={{ fontSize: 24 }}>{item.emoji}</span>
            <span className="sp">{item.name}<div className="sub">{KIND_LABEL[item.kind]}</div></span>
            <span className="sub">{item.per_unit.sugar} g sugar · {item.per_unit.kcal} kcal</span>
          </button>
        ))}
      </div>
    </>
  )
}
