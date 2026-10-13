import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { PhotoInput } from '../add/PhotoInput'
import { useFoodUpload } from '../add/upload'
import { api, ApiError } from '../api/client'
import type { Nutrients, SavedSnack, SnackKind } from '../api/types'
import { todayISO } from '../lib/dates'
import { type ProductSnack, productSnack, unknownProduct } from '../lib/barcode'
import { isTreatKind, KIND_EMOJI, KIND_LABEL, SNACK_KINDS } from '../lib/snacks'
import { Icon } from '../ui/Icon'
import { Photo } from '../ui/Photo'
import { Sheet } from '../ui/Sheet'
import { Toggle } from '../ui/Toggle'
import { useToast } from '../ui/Toast'
import { BarcodeScanner } from './BarcodeScanner'
import { SnackAmount } from './SnackAmount'

export const SAVED_SNACKS = ['saved-snacks']

/** Log a snack: one of ours, a typical one from the list, a scanned barcode or a new photo/label.
 *  With `saved` it opens straight on that snack (from Meals → Snacks), with `scan` on the scanner. */
export function LogSnackSheet({ open, onClose, saved, scan = false }: { open: boolean; onClose: () => void; saved?: SavedSnack; scan?: boolean }) {
  return (
    <Sheet open={open} onClose={onClose} label="Log a snack">
      <LogSnack onClose={onClose} saved={saved} scan={scan} /> {/* fresh on each open */}
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
  scanned?: { code: string; quantity: string; missingValues: boolean; remembered: boolean } // from a barcode
}

const fromSaved = (s: SavedSnack): Draft => ({
  name: s.name, emoji: s.emoji, kind: s.kind, per: s.per, amount: s.amount, perUnit: s.per_unit, saved: s,
})

function LogSnack({ onClose, saved, scan }: { onClose: () => void; saved?: SavedSnack; scan: boolean }) {
  const qc = useQueryClient()
  const toast = useToast()
  const upload = useFoodUpload(onClose)
  const catalog = useQuery({ queryKey: ['snack-catalog'], queryFn: api.snackCatalog, staleTime: Infinity })
  const ours = useQuery({ queryKey: SAVED_SNACKS, queryFn: api.savedSnacks })
  const [draft, setDraft] = useState<Draft | null>(saved ? fromSaved(saved) : null) // picked: confirm amount and values first
  const [valid, setValid] = useState(true)
  const [scanning, setScanning] = useState(scan)
  const [save, setSave] = useState(false)
  const lookup = useMutation({
    mutationFn: api.product,
    onSuccess: (product) => pickScanned(productSnack(product), { code: product.code, quantity: product.quantity, remembered: product.remembered }),
  })
  const log = useMutation({
    mutationFn: (d: Draft) =>
      api.logSnack({
        eaten_on: todayISO(), name: d.name, emoji: d.emoji, kind: d.kind, source: d.saved ? 'saved' : d.scanned ? 'barcode' : 'list',
        per: d.per, amount: d.amount, per_unit: d.perUnit, saved_id: d.saved?.id, save: !!d.scanned && save,
        barcode: d.scanned?.code,
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

  const pick = (d: Draft) => {
    setValid(!d.scanned?.missingValues)
    setDraft(d)
  }
  const pickScanned = (p: ProductSnack, from: { code: string; quantity: string; remembered: boolean }) =>
    pick({ name: p.name, emoji: KIND_EMOJI[p.kind], kind: p.kind, per: p.per, amount: p.amount, perUnit: p.perUnit,
      scanned: { ...from, missingValues: p.missingValues } })

  if (draft) {
    const scanned = draft.scanned
    return (
      <>
        <div className="row" style={{ gap: 12 }}>
          {draft.saved?.photo_url && (
            <Photo url={draft.saved.photo_url} emoji={draft.emoji} alt="" style={{ width: 56, height: 56, aspectRatio: '1', flex: 'none' }} />
          )}
          {scanned ? (
            <label className="field sp">
              <span className="visually-hidden">Product name</span>
              <input value={draft.name} maxLength={120} placeholder="Product name" autoComplete="off"
                onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </label>
          ) : (
            <h1 className="sp">{draft.saved?.photo_url ? '' : `${draft.emoji} `}{draft.name}</h1>
          )}
        </div>
        <div className="sub" style={{ marginBottom: 12 }}>
          {scanned
            ? scanned.remembered
              ? 'Your values from last time. Change them if this one was different.'
              : scanned.missingValues
                ? 'Open Food Facts has no values for this one. Type them from the label, we remember them.'
                : `From Open Food Facts${scanned.quantity ? ` · ${scanned.quantity} pack` : ''}. Check them against the label, we remember your changes.`
            : draft.saved ? 'Your values from last time. Change them if this one was different.' : 'Typical values. Change them if yours was different.'}
        </div>
        {scanned && (
          <Toggle<SnackKind> label="Snack type" value={draft.kind} onChange={(kind) => setDraft({ ...draft, kind, emoji: KIND_EMOJI[kind] })}
            options={SNACK_KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))} />
        )}
        {scanned && isTreatKind(draft.kind) && (
          <div className="sub row" style={{ gap: 6, marginBottom: 12 }}><Icon name="gift" size={16} /> Counts as a treat for your streak</div>
        )}
        <SnackAmount per={draft.per} amount={draft.amount} perUnit={draft.perUnit} startEditing={scanned?.missingValues}
          onAmount={(amount) => setDraft({ ...draft, amount })} onPerUnit={(perUnit) => setDraft({ ...draft, perUnit })} onValid={setValid} />
        {scanned && (
          <label className="switch-row card" style={{ marginBottom: 12 }}>
            <span className="sp"><b>Save to our snacks</b><small className="sub">Log it again in one tap, from Snacks under Meals</small></span>
            <input type="checkbox" role="switch" className="switch" checked={save} onChange={(e) => setSave(e.target.checked)} />
          </label>
        )}
        {(log.error ?? remove.error) && <p className="error" role="alert">{(log.error ?? remove.error)!.message}</p>}
        <button className="btn" disabled={log.isPending || !valid || !draft.name.trim()} onClick={() => log.mutate(draft)}>Log snack</button>
        {!saved && (
          <button className="btn ghost" style={{ marginTop: 8 }} onClick={() => { setDraft(null); setScanning(!!scanned) }}>
            {scanned ? 'Scan another' : 'Pick another'}
          </button>
        )}
        {draft.saved && (
          <button className="textbtn" style={{ marginTop: 12 }} disabled={remove.isPending} onClick={() => remove.mutate(draft.saved!)}>
            Remove from our snacks
          </button>
        )}
      </>
    )
  }

  if (scanning) {
    const notFound = lookup.error instanceof ApiError && lookup.error.status === 404
    return (
      <>
        <h1>Scan a barcode</h1>
        <BarcodeScanner busy={lookup.isPending} onCode={(code) => lookup.mutate(code)} />
        {lookup.error && (
          <div role="alert" className="card" style={{ marginTop: 12 }}>
            <p className="error" style={{ margin: 0 }}>{notFound ? 'Not in Open Food Facts yet.' : lookup.error.message}</p>
            {notFound && (
              <button className="btn" style={{ margin: '10px 0 8px' }}
                onClick={() => pickScanned(unknownProduct(), { code: lookup.variables!, quantity: '', remembered: false })}>
                <Icon name="edit" size={18} /> Type the values from the pack
              </button>
            )}
            {notFound && (
              <PhotoInput camera label="Scan the label instead" disabled={upload.busy} className="btn ghost"
                onFile={(file) => upload.photo.mutate({ file, kind: 'label' })}>
                <Icon name="tag" size={18} /> Scan the nutrition label instead
              </PhotoInput>
            )}
          </div>
        )}
        <button className="textbtn add-back" onClick={() => { lookup.reset(); setScanning(false) }}>
          <Icon name="back" size={18} /> All snacks
        </button>
      </>
    )
  }

  return (
    <>
      <h1>Log a snack</h1>
      <div className="sub" style={{ marginBottom: 12 }}>
        Sweets and sugary drinks count as treats for your streak and croissant rewards. Fruit and savory snacks only add to your macros.
      </div>
      <button className="btn" style={{ marginBottom: 8 }} onClick={() => setScanning(true)}>
        <Icon name="barcode" size={18} /> Scan barcode
      </button>
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
