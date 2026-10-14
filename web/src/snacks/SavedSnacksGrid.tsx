import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { PhotoInput } from '../add/PhotoInput'
import { useFoodUpload } from '../add/upload'
import { api } from '../api/client'
import type { SavedSnack } from '../api/types'
import { KIND_LABEL, perLabel } from '../lib/snacks'
import { Icon } from '../ui/Icon'
import { Photo } from '../ui/Photo'
import { LogSnackSheet, SAVED_SNACKS } from './LogSnackSheet'

/** Meals → Snacks: the snacks we saved; tap one to log it again. */
export function SavedSnacksGrid() {
  const snacks = useQuery({ queryKey: SAVED_SNACKS, queryFn: api.savedSnacks })
  const [open, setOpen] = useState<SavedSnack | null>(null)
  const upload = useFoodUpload()

  return (
    <>
      {snacks.isError && <p className="error" role="alert">{snacks.error.message}</p>}
      <div className="mealgrid">
        {(snacks.data ?? []).map((s) => (
          <button key={s.id} className="mealcard" aria-label={s.name} onClick={() => setOpen(s)}>
            <Photo url={s.photo_url} emoji={s.emoji} seed={s.id} alt={s.name} />
            <div className="b">
              <h3>{s.name}</h3>
              <div className="sub">{KIND_LABEL[s.kind]} · {Math.round(s.per_unit.kcal)} kcal / {perLabel(s.per)}</div>
            </div>
          </button>
        ))}
      </div>
      {snacks.isSuccess && !snacks.data.length && (
        <div className="card" style={{ textAlign: 'center' }}>
          <p className="sub">No saved snacks yet. Snap one and switch on “Save to our snacks”.</p>
          <PhotoInput camera label="Snap a snack" disabled={upload.busy} className="btn"
            onFile={(file) => upload.photo.mutate({ file, kind: 'snack' })}>
            <Icon name="camera" size={18} /> Snap a snack
          </PhotoInput>
        </div>
      )}
      <LogSnackSheet open={open !== null} onClose={() => setOpen(null)} saved={open ?? undefined} key={open?.id ?? 'none'} />
    </>
  )
}
