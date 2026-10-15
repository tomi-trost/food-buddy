import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { PhotoInput } from '../add/PhotoInput'
import { useFoodUpload } from '../add/upload'
import { api, ApiError } from '../api/client'
import type { MealCard, Nutrients, SnackKind, SnackPer } from '../api/types'
import { todayISO } from '../lib/dates'
import { guessPieceG, piecesIn, type ProductSnack, productSnack, scannedAmount, unknownProduct } from '../lib/barcode'
import { scale } from '../lib/macros'
import { CookMealSheet } from '../meals/CookSheet'
import { Stepper } from '../ui/Stepper'
import { isTreatKind, KIND_EMOJI, KIND_LABEL, perLabel, SNACK_KINDS } from '../lib/snacks'
import { Icon } from '../ui/Icon'
import { Photo } from '../ui/Photo'
import { Sheet } from '../ui/Sheet'
import { Toggle } from '../ui/Toggle'
import { useToast } from '../ui/Toast'
import { BarcodeScanner } from './BarcodeScanner'
import { SnackAmount } from './SnackAmount'

/** Log a snack: one of ours (a snack meal, 0025), a typical one from the list, a scanned barcode
 *  or a new photo/label. With `scan` it opens on the scanner. */
export function LogSnackSheet({ open, onClose, scan = false }: { open: boolean; onClose: () => void; scan?: boolean }) {
  const [logging, setLogging] = useState<number | null>(null) // one of ours: its own log sheet
  return (
    <>
      <Sheet open={open} onClose={onClose} label="Log a snack">
        <LogSnack onClose={onClose} scan={scan} onOurs={(id) => { onClose(); setLogging(id) }} /> {/* fresh on each open */}
      </Sheet>
      <CookMealSheet mealId={logging} initialType="snack" onClose={() => setLogging(null)} />
    </>
  )
}

/** Our snacks, most recently eaten first. */
const oursFirst = (cards: MealCard[]) =>
  cards.filter((m) => m.types.includes('snack')).sort((a, b) => (b.last_cooked ?? '').localeCompare(a.last_cooked ?? ''))

type Draft = {
  name: string
  emoji: string
  kind: SnackKind
  per: SnackPer
  amount: number
  perUnit: Nutrients
  // from a barcode: per is 100g or 100ml and perUnit per 100 g/ml; amount is grams/ml, or pieces
  // while pieceG is set (one piece in grams/ml)
  scanned?: { code: string; quantity: string; missingValues: boolean; remembered: boolean; pieceG: number | null; servingG: number | null }
}

function LogSnack({ onClose, scan, onOurs }: { onClose: () => void; scan: boolean; onOurs: (mealId: number) => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const upload = useFoodUpload(onClose)
  const catalog = useQuery({ queryKey: ['snack-catalog'], queryFn: api.snackCatalog, staleTime: Infinity })
  const meals = useQuery({ queryKey: ['meals'], queryFn: api.meals })
  const ours = oursFirst(meals.data ?? [])
  const [draft, setDraft] = useState<Draft | null>(null) // picked: confirm amount and values first
  const [valid, setValid] = useState(true)
  const [scanning, setScanning] = useState(scan)
  const [save, setSave] = useState(false)
  const lookup = useMutation({
    mutationFn: api.product,
    onSuccess: (product) => {
      setSave(product.meal_id !== null) // already one of ours: logging keeps it up to date
      pickScanned(productSnack(product), { code: product.code, quantity: product.quantity, remembered: product.remembered })
    },
  })
  const log = useMutation({
    mutationFn: (d: Draft) =>
      api.logSnack({
        eaten_on: todayISO(), name: d.name, emoji: d.emoji, kind: d.kind, source: d.scanned ? 'barcode' : 'list',
        ...(d.scanned ? scannedAmount(d.perUnit, d.amount, d.scanned.pieceG, d.per === '100ml' ? '100ml' : '100g') : { per: d.per, amount: d.amount, per_unit: d.perUnit }),
        save, barcode: d.scanned?.code,
      }),
    onSuccess: (logged) => {
      for (const key of ['day', 'insights', 'meals', 'inventory', 'rewards']) qc.invalidateQueries({ queryKey: [key] })
      onClose()
      toast(`${logged.name} logged${logged.meal_id ? ' · in our snacks' : ''}${logged.treat ? ` · ${Math.round(logged.sugar)} g treat sugar` : ''}`)
    },
  })

  const pick = (d: Draft) => {
    setValid(!d.scanned?.missingValues)
    setDraft(d)
  }
  const pickScanned = (p: ProductSnack, from: { code: string; quantity: string; remembered: boolean }) =>
    pick({ name: p.name, emoji: KIND_EMOJI[p.kind], kind: p.kind, per: p.per, amount: p.amount, perUnit: p.perUnit,
      scanned: { ...from, missingValues: p.missingValues, pieceG: p.pieceG, servingG: p.servingG } })

  if (draft) {
    const scanned = draft.scanned
    return (
      <>
        <div className="row" style={{ gap: 12 }}>
          {scanned ? (
            <label className="field sp">
              <span className="visually-hidden">Product name</span>
              <input value={draft.name} maxLength={120} placeholder="Product name" autoComplete="off"
                onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </label>
          ) : (
            <h1 className="sp">{draft.emoji} {draft.name}</h1>
          )}
        </div>
        <div className="sub" style={{ marginBottom: 12 }}>
          {scanned
            ? scanned.remembered
              ? 'Your values from last time. Change them if this one was different.'
              : scanned.missingValues
                ? 'Open Food Facts has no values for this one. Type them from the label, we remember them.'
                : `From Open Food Facts${scanned.quantity ? ` · ${scanned.quantity} pack` : ''}. Check them against the label, we remember your changes.`
            : 'Typical values. Change them if yours was different.'}
        </div>
        {scanned && (
          <Toggle<SnackKind> label="Snack type" value={draft.kind} onChange={(kind) => setDraft({ ...draft, kind, emoji: KIND_EMOJI[kind] })}
            options={SNACK_KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))} />
        )}
        {scanned && isTreatKind(draft.kind) && (
          <div className="sub row" style={{ gap: 6, marginBottom: 12 }}><Icon name="gift" size={16} /> Counts as a treat for your streak</div>
        )}
        {scanned && (
          <Toggle<'g' | 'ml' | 'pc'> label="Count in" value={scanned.pieceG ? 'pc' : draft.per === '100ml' ? 'ml' : 'g'}
            options={[{ value: 'g', label: 'Grams' }, { value: 'ml', label: 'ml' }, { value: 'pc', label: 'Pieces' }]}
            onChange={(v) => {
              if (v === 'pc') {
                if (scanned.pieceG) return
                const pieceG = guessPieceG(scanned.servingG, draft.per === '100ml')
                setDraft({ ...draft, amount: piecesIn(draft.amount, pieceG), scanned: { ...scanned, pieceG } })
                return
              }
              const per = v === 'ml' ? '100ml' : '100g' // the values stay: about 1 g per ml
              const amount = scanned.pieceG ? Math.max(1, Math.round(draft.amount * scanned.pieceG)) : draft.amount
              setDraft({ ...draft, per, amount, scanned: { ...scanned, pieceG: null } })
            }} />
        )}
        {scanned?.pieceG ? (
          <>
            <SnackAmount per="piece" amount={draft.amount} perUnit={scale(draft.perUnit, scanned.pieceG)} startEditing={scanned.missingValues}
              onAmount={(amount) => setDraft({ ...draft, amount })}
              onPerUnit={(perPiece) => setDraft({ ...draft, perUnit: scale(perPiece, 10000 / scanned.pieceG!) })} onValid={setValid} />
            <div className="card row">
              <div className="sp"><h3>One piece</h3><div className="sub">{draft.per === '100ml' ? 'ml' : 'weight'} from the pack; change it if yours differ</div></div>
              <Stepper label="piece weight" value={scanned.pieceG} step={1} min={0.5} max={2000} unit={draft.per === '100ml' ? ' ml' : ' g'} decimals={1}
                onChange={(pieceG) => setDraft({ ...draft, scanned: { ...scanned, pieceG } })} />
            </div>
          </>
        ) : (
          <SnackAmount per={draft.per} amount={draft.amount} perUnit={draft.perUnit} startEditing={scanned?.missingValues}
            onAmount={(amount) => setDraft({ ...draft, amount })} onPerUnit={(perUnit) => setDraft({ ...draft, perUnit })} onValid={setValid} />
        )}
        <label className="switch-row card" style={{ marginBottom: 12 }}>
          <span className="sp"><b>Save to our snacks</b><small className="sub">Under Meals → Snacks: log it again in one tap, rate it, keep it at home</small></span>
          <input type="checkbox" role="switch" className="switch" checked={save} onChange={(e) => setSave(e.target.checked)} />
        </label>
        {log.error && <p className="error" role="alert">{log.error.message}</p>}
        <button className="btn" disabled={log.isPending || !valid || !draft.name.trim()} onClick={() => log.mutate(draft)}>Log snack</button>
        <button className="btn ghost" style={{ marginTop: 8 }} onClick={() => { setDraft(null); setSave(false); setScanning(!!scanned) }}>
          {scanned ? 'Scan another' : 'Pick another'}
        </button>
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
          onFile={(file) => upload.photo.mutate({ file, kind: 'meal', meal: { type: 'snack', saveOnly: false } })}>
          <Icon name="camera" size={18} /> Photo
        </PhotoInput>
        <PhotoInput camera label="Scan label" disabled={upload.busy} className="btn ghost"
          onFile={(file) => upload.photo.mutate({ file, kind: 'label' })}>
          <Icon name="tag" size={18} /> Scan label
        </PhotoInput>
      </div>
      {!!ours.length && (
        <>
          <h2>Our snacks</h2>
          <div className="list" aria-label="Our snacks">
            {ours.map((s) => (
              <button key={s.id} style={{ width: '100%', textAlign: 'left' }} disabled={log.isPending} onClick={() => onOurs(s.id)}>
                <Photo url={s.photo_url} emoji={s.emoji} seed={s.id} alt="" style={{ width: 36, height: 36, aspectRatio: '1', fontSize: 20, flex: 'none' }} />
                <span className="sp">{s.name}<div className="sub">{s.snack_kind ? KIND_LABEL[s.snack_kind] : 'Snack'}</div></span>
                <span className="sub">{Math.round(s.per_unit.kcal)} kcal / {perLabel(s.per)}</span>
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
