import { useMutation, useQueryClient } from '@tanstack/react-query'
import { type ChangeEvent, useId } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { api } from '../api/client'
import { OPEN_ANALYSES } from '../layout/PendingBanner'
import { guessMealType } from '../lib/dates'
import { Icon } from '../ui/Icon'
import { useToast } from '../ui/Toast'

const TYPES = ['breakfast', 'lunch', 'dinner']
const KINDS = ['meal', 'snack', 'label'] as const
type Kind = (typeof KINDS)[number]

const MODE: Record<Kind, { tab: string; title: (type: string) => string; hint: string }> = {
  meal: { tab: 'Meal', title: (type) => `Snap your ${type}`, hint: 'From above, whole plate in view' },
  snack: { tab: 'Snack', title: () => 'Snap your snack', hint: 'Fill the frame with the snack' },
  label: { tab: 'Label', title: () => 'Scan a nutrition label', hint: 'Flat and well lit, whole table in view' },
}

// Camera-app layout (Cal AI / Meal Scan style): framed viewfinder, mode switcher,
// library tile · shutter. The phone's own camera opens via the file input, so the
// viewfinder is a big tap target rather than a live preview.
export function SnapPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const type = TYPES.includes(params.get('type') ?? '') ? params.get('type')! : guessMealType()
  const kind = KINDS.find((k) => k === params.get('kind')) ?? 'meal'
  const cameraId = useId()
  const libraryId = useId()
  const upload = useMutation({
    mutationFn: (file: File) => api.uploadPhoto(file, kind),
    onSuccess: (job) => {
      qc.invalidateQueries({ queryKey: OPEN_ANALYSES })
      if (kind === 'meal') {
        navigate(`/analysis/${job.id}?type=${type}`, { replace: true }) // rate while it runs
      } else {
        navigate('/', { replace: true })
        toast(`${kind === 'label' ? 'Reading the label' : 'Analyzing your snack'}… it shows up above the tabs when ready`)
      }
    },
  })
  const pick = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) upload.mutate(file)
    e.target.value = '' // picking the same photo again still fires onChange
  }
  const setKind = (k: Kind) => {
    const next = new URLSearchParams(params)
    if (k === 'meal') next.delete('kind')
    else next.set('kind', k)
    setParams(next, { replace: true })
    upload.reset()
  }
  const mode = MODE[kind]
  const busy = upload.isPending

  return (
    <div className="camera">
      <input id={cameraId} className="visually-hidden" type="file" accept="image/*" capture="environment"
        aria-label="Take photo" disabled={busy} onChange={pick} />
      {/* no `capture`: iOS opens the photo library for photos taken earlier */}
      <input id={libraryId} className="visually-hidden" type="file" accept="image/*"
        aria-label="Choose from library" disabled={busy} onChange={pick} />

      <header className="cam-top">
        <button className="cam-round" onClick={() => navigate(-1)} aria-label="Close"><Icon name="close" size={22} /></button>
        <h1>{mode.title(type)}</h1>
        <span className="cam-round" aria-hidden style={{ visibility: 'hidden' }} />
      </header>

      <label htmlFor={cameraId} className="viewfinder" aria-busy={busy}>
        <i className="vf-c tl" /><i className="vf-c tr" /><i className="vf-c bl" /><i className="vf-c br" />
        {busy ? (
          <span className="vf-msg pulse"><Icon name="camera" size={40} /><b>Uploading photo…</b></span>
        ) : (
          <span className="vf-msg">
            <Icon name="camera" size={40} />
            <b>Tap to take a photo</b>
            <small>{mode.hint}</small>
          </span>
        )}
        {upload.isError && <span role="alert" className="vf-error">{upload.error.message}</span>}
      </label>

      <div className="cam-modes" role="group" aria-label="What are you snapping?">
        {KINDS.map((k) => (
          <button key={k} aria-pressed={k === kind} disabled={busy} onClick={() => setKind(k)}>{MODE[k].tab}</button>
        ))}
      </div>

      <div className="cam-bar">
        <label htmlFor={libraryId} className="cam-lib" aria-disabled={busy}>
          <span className="cam-lib-tile"><Icon name="image" size={24} /></span>
          Library
        </label>
        <label htmlFor={cameraId} className="shutter" aria-disabled={busy} title="Take photo"><span /></label>
        <span aria-hidden />
      </div>
    </div>
  )
}
