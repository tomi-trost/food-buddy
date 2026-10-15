import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { api, ApiError } from '../api/client'
import type { AnalysisJob, SnackKind, SnackPer, SnackResult } from '../api/types'
import { OPEN_ANALYSES } from '../layout/PendingBanner'
import { todayISO } from '../lib/dates'
import {
  amountStep, amountUnit, type Crossed, crossedValues, isTreatKind, KIND_EMOJI as EMOJI, KIND_LABEL, perLabel, SNACK_KINDS,
  snackNutrients, switchPer,
} from '../lib/snacks'
import { Icon } from '../ui/Icon'
import { MacroTiles } from '../ui/Macro'
import { NutrientFields } from '../ui/NutrientFields'
import { Photo } from '../ui/Photo'
import { Stepper } from '../ui/Stepper'
import { Toggle } from '../ui/Toggle'
import { useToast } from '../ui/Toast'

export function SnackPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const qc = useQueryClient()
  const job = useQuery({
    queryKey: ['analysis', id],
    queryFn: () => api.analysis(id),
    refetchInterval: (q) => (q.state.data?.status === 'done' || q.state.data?.status === 'failed' ? false : 2000),
  })
  const update = (updated: AnalysisJob) => {
    qc.setQueryData(['analysis', id], updated)
    qc.invalidateQueries({ queryKey: OPEN_ANALYSES })
  }
  const retry = useMutation({ mutationFn: () => api.retryAnalysis(Number(id)), onSuccess: update })
  const discard = useMutation({
    mutationFn: () => api.discardAnalysis(Number(id)),
    onSuccess: (updated) => {
      update(updated)
      navigate('/', { replace: true })
      toast('Photo discarded')
    },
  })
  const label = job.data?.kind === 'label'
  const close = <button className="icon" aria-label="Close" onClick={() => navigate('/')}><Icon name="close" /></button>

  if (job.data?.closed) {
    return (
      <>
        <div className="top">{close}<span /><span style={{ width: 44 }} /></div>
        <section className="card">
          <h3>Already done</h3>
          <p className="sub">This photo was already logged or discarded.</p>
          <Link to="/" className="btn">Back home</Link>
        </section>
      </>
    )
  }
  if (job.data?.status === 'done' && job.data.snack) {
    return <SnackForm analysisId={job.data.id} photoUrl={job.data.photo_url} label={label} initial={job.data.snack} close={close} />
  }
  const error = job.error ?? retry.error ?? discard.error
  return (
    <>
      <div className="top">{close}<span className="sub">{label ? 'Reading label…' : 'Identifying snack…'}</span><span style={{ width: 44 }} /></div>
      {job.data?.status === 'failed' ? (
        <section className="card">
          <h3>Couldn't read this photo</h3>
          <p className="sub">{job.data.error}</p>
          <button className="btn" disabled={retry.isPending} onClick={() => retry.mutate()}>Try again</button>
          <Link to="/" className="btn ghost" style={{ marginTop: 8 }}>Back home</Link>
        </section>
      ) : (
        <>
          <div role="status" aria-label={label ? 'Reading label' : 'Identifying snack'}>
            <div className="shimmer" style={{ height: 120 }} />
            <div className="shimmer" style={{ width: '60%', height: 26 }} />
            <div className="shimmer" />
            <p className="sub">This takes a few minutes. It shows up above the tabs when it's ready.</p>
          </div>
          <button className="btn ghost" onClick={() => navigate('/')}>Check it later</button>
        </>
      )}
      {error && <p className="error" role="alert">{error.message}</p>}
      {job.data && (
        <button className="textbtn" style={{ marginTop: 12 }} disabled={discard.isPending} onClick={() => discard.mutate()}>
          Discard this photo
        </button>
      )}
    </>
  )
}

function SnackForm({ analysisId, photoUrl, label, initial, close }: {
  analysisId: number
  photoUrl: string | null
  label: boolean
  initial: SnackResult
  close: React.ReactNode
}) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const toast = useToast()
  const [snack, setSnack] = useState(initial)
  const [crossed, setCrossed] = useState<Crossed | null>(null) // counted the other way than the model/label said
  useEffect(() => {
    setSnack(initial)
    setCrossed(null)
  }, [initial])
  const [editing, setEditing] = useState(false)
  const [valuesOk, setValuesOk] = useState(true)
  const [save, setSave] = useState(false)
  const values = snackNutrients(snack)
  const countIn = (to: SnackPer) => {
    const next = switchPer(snack, to, crossed)
    setSnack((s) => ({ ...s, ...next.snack }))
    setCrossed(next.crossed)
  }
  const setPieceG = (pieceG: number) => {
    const c = { ...crossed!, pieceG }
    setCrossed(c)
    setSnack((s) => ({ ...s, per_unit: crossedValues(c, s.per) }))
  }

  const log = useMutation({
    mutationFn: () =>
      api.logSnack({
        eaten_on: todayISO(), name: snack.name, emoji: EMOJI[snack.kind], kind: snack.kind,
        source: label ? 'label' : 'photo', per: snack.per, amount: snack.amount, per_unit: snack.per_unit,
        analysis_id: analysisId, save,
      }),
    onSuccess: () => {
      if (save) qc.invalidateQueries({ queryKey: ['meals'] })
      qc.invalidateQueries({ queryKey: ['day'] })
      qc.invalidateQueries({ queryKey: ['insights'] })
      qc.invalidateQueries({ queryKey: OPEN_ANALYSES })
      navigate('/', { replace: true })
      toast('Snack logged')
    },
    // Logged by the other person meanwhile: reload the job, the page then says so
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409) qc.invalidateQueries({ queryKey: ['analysis', String(analysisId)] })
    },
  })

  return (
    <>
      <div className="top">{close}<span className="sub">{label ? 'Read from label' : 'Detected from photo'}</span><span style={{ width: 44 }} /></div>
      <div className="row" style={{ gap: 12, marginBottom: 12 }}>
        <Photo url={photoUrl} emoji={EMOJI[snack.kind]} alt="" style={{ width: 72, height: 72, aspectRatio: '1', fontSize: 36, flex: 'none' }} />
        <div className="sp">
          <h1 style={{ fontSize: 20 }}>{snack.name}</h1>
          <div className="sub">
            {label
              ? `Per ${perLabel(snack.per)}: ${Math.round(snack.per_unit.kcal)} kcal · ${snack.per_unit.sugar} g sugar — double-check the values`
              : 'We think this is the snack — change the type if wrong'}
          </div>
        </div>
      </div>
      <Toggle<SnackKind> label="Snack type" value={snack.kind} onChange={(kind) => setSnack((s) => ({ ...s, kind }))}
        options={SNACK_KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))} />
      <Toggle<SnackPer> label="Count in" value={snack.per} onChange={countIn}
        options={[{ value: '100g', label: 'Grams' }, { value: '100ml', label: 'ml' }, { value: 'piece', label: 'Pieces' }]} />
      <MacroTiles values={values} label="This snack" />
      <section className="card" style={{ marginTop: 14 }}>
        <div className="row">
          <div className="sp">
            <h3>Values per {perLabel(snack.per)}</h3>
            <div className="sub">{crossed ? 'from one piece’s weight' : label ? 'as read from the label' : 'estimated from the photo'}</div>
          </div>
          <button type="button" className="btn ghost" style={{ width: 'auto', padding: '0 14px' }} aria-expanded={editing}
            disabled={!valuesOk} onClick={() => setEditing((e) => !e)}>
            {editing ? 'Done' : 'Edit values'}
          </button>
        </div>
        {editing && (
          <NutrientFields initial={snack.per_unit} onChange={(n) => {
            setValuesOk(n !== null)
            if (n) {
              setSnack((s) => ({ ...s, per_unit: n }))
              setCrossed(null) // typed in for this unit: no more converting
            }
          }} />
        )}
        {!valuesOk && <p className="error" role="alert">Fix the values marked in red.</p>}
      </section>
      <div className="card row" style={{ marginTop: 14 }}>
        <div className="sp"><h3>Amount</h3><div className="sub">{snack.per === 'piece' ? 'how many' : snack.per === '100ml' ? 'ml you drank' : 'grams you ate'}</div></div>
        <Stepper label="amount" value={snack.amount} step={amountStep(snack.per)} min={amountStep(snack.per)} max={2000}
          unit={amountUnit(snack.per, snack.amount)} onChange={(amount) => setSnack((s) => ({ ...s, amount }))} />
      </div>
      {crossed && (
        <div className="card row">
          <div className="sp"><h3>One piece</h3><div className="sub">how much one piece or portion weighs</div></div>
          <Stepper label="piece weight" value={crossed.pieceG} step={5} min={1} max={2000} unit={snack.per === '100ml' || crossed.from === '100ml' ? ' ml' : ' g'}
            onChange={setPieceG} />
        </div>
      )}
      {isTreatKind(snack.kind) && (
        <div className="sub row" style={{ gap: 6, marginBottom: 12 }}><Icon name="gift" size={16} /> Counts as a treat for your streak</div>
      )}
      <label className="switch-row card" style={{ marginBottom: 12 }}>
        <span className="sp"><b>Save to our snacks</b><small className="sub">Under Meals → Snacks: log it again in one tap, rate it, keep it at home</small></span>
        <input type="checkbox" role="switch" className="switch" checked={save} onChange={(e) => setSave(e.target.checked)} />
      </label>
      {log.isError && <p className="error" role="alert">{log.error.message}</p>}
      <button className="btn" disabled={log.isPending || !valuesOk} onClick={() => log.mutate()}>Log snack</button>
    </>
  )
}
