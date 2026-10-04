import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { api } from '../api/client'
import type { SnackKind, SnackResult } from '../api/types'
import { todayISO } from '../lib/dates'
import { amountStep, KIND_LABEL, snackNutrients } from '../lib/snacks'
import { Icon } from '../ui/Icon'
import { MacroTiles } from '../ui/Macro'
import { Photo } from '../ui/Photo'
import { Stepper } from '../ui/Stepper'
import { Toggle } from '../ui/Toggle'
import { useToast } from '../ui/Toast'

const EMOJI: Record<SnackKind, string> = { sweet: '🍪', savory: '🥨', drink: '🥤' }

export function SnackPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const job = useQuery({
    queryKey: ['analysis', id],
    queryFn: () => api.analysis(id),
    refetchInterval: (q) => (q.state.data?.status === 'done' || q.state.data?.status === 'failed' ? false : 2000),
  })
  const label = job.data?.kind === 'label'
  const close = <button className="icon" aria-label="Close" onClick={() => navigate('/')}><Icon name="close" /></button>

  if (job.data?.status === 'done' && job.data.snack) {
    return <SnackForm photoUrl={job.data.photo_url} label={label} initial={job.data.snack} close={close} />
  }
  return (
    <>
      <div className="top">{close}<span className="sub">{label ? 'Reading label…' : 'Identifying snack…'}</span><span style={{ width: 44 }} /></div>
      {job.data?.status === 'failed' ? (
        <section className="card">
          <h3>Couldn't read this photo</h3>
          <p className="sub">{job.data.error}</p>
          <Link to="/" className="btn">Back home</Link>
        </section>
      ) : (
        <div role="status" aria-label={label ? 'Reading label' : 'Identifying snack'}>
          <div className="shimmer" style={{ height: 120 }} />
          <div className="shimmer" style={{ width: '60%', height: 26 }} />
          <div className="shimmer" />
        </div>
      )}
      {job.isError && <p className="error" role="alert">{job.error.message}</p>}
    </>
  )
}

function SnackForm({ photoUrl, label, initial, close }: { photoUrl: string; label: boolean; initial: SnackResult; close: React.ReactNode }) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const toast = useToast()
  const [snack, setSnack] = useState(initial)
  useEffect(() => setSnack(initial), [initial])
  const values = snackNutrients(snack)
  const unit = snack.per === 'piece' ? (snack.amount === 1 ? ' piece' : ' pieces') : ' g'

  const log = useMutation({
    mutationFn: () =>
      api.logSnack({
        eaten_on: todayISO(), name: snack.name, emoji: EMOJI[snack.kind], kind: snack.kind,
        source: label ? 'label' : 'photo', per: snack.per, amount: snack.amount, per_unit: snack.per_unit,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['day'] })
      qc.invalidateQueries({ queryKey: ['insights'] })
      navigate('/', { replace: true })
      toast('Snack logged')
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
              ? `Per 100 g: ${Math.round(snack.per_unit.kcal)} kcal · ${snack.per_unit.sugar} g sugar — double-check the values`
              : 'We think this is the snack — change the type if wrong'}
          </div>
        </div>
      </div>
      <Toggle<SnackKind> label="Snack type" value={snack.kind} onChange={(kind) => setSnack((s) => ({ ...s, kind }))}
        options={(['sweet', 'savory', 'drink'] as const).map((k) => ({ value: k, label: KIND_LABEL[k] }))} />
      <MacroTiles values={values} label="This snack" />
      <div className="card row" style={{ marginTop: 14 }}>
        <div className="sp"><h3>Amount</h3><div className="sub">{label ? 'portion you ate' : 'how many'}</div></div>
        <Stepper label="amount" value={snack.amount} step={amountStep(snack.per)} min={amountStep(snack.per)} max={2000} unit={unit}
          onChange={(amount) => setSnack((s) => ({ ...s, amount }))} />
      </div>
      {snack.kind !== 'savory' && (
        <div className="sub row" style={{ gap: 6, marginBottom: 12 }}><Icon name="gift" size={16} /> Counts as a treat for your streak</div>
      )}
      {log.isError && <p className="error" role="alert">{log.error.message}</p>}
      <button className="btn" disabled={log.isPending} onClick={() => log.mutate()}>Log snack</button>
    </>
  )
}
