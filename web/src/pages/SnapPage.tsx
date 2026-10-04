import { useMutation } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router'
import { api } from '../api/client'
import { guessMealType } from '../lib/dates'
import { Icon } from '../ui/Icon'

const TYPES = ['breakfast', 'lunch', 'dinner']

export function SnapPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const type = TYPES.includes(params.get('type') ?? '') ? params.get('type')! : guessMealType()
  const kind = (['snack', 'label'] as const).find((k) => k === params.get('kind')) ?? 'meal'
  const upload = useMutation({
    mutationFn: (file: File) => api.uploadPhoto(file, kind),
    onSuccess: (job) =>
      navigate(kind === 'meal' ? `/analysis/${job.id}?type=${type}` : `/snack/${job.id}`, { replace: true }),
  })
  const hint = { meal: 'Photo from above, whole plate in view', snack: 'Frame the snack', label: 'Frame the nutrition table on the back of the pack' }[kind]

  return (
    <div className="camera">
      <button onClick={() => navigate(-1)} aria-label="Close" style={{ alignSelf: 'flex-start', color: '#fff', minHeight: 44 }}>
        <Icon name="close" size={26} />
      </button>
      <div style={{ textAlign: 'center' }}>
        <div className="plate"><Icon name="camera" size={64} /></div>
        <p style={{ opacity: 0.75 }}>{hint}</p>
        {upload.isError && <p role="alert" style={{ color: '#ffb4a8' }}>{upload.error.message}</p>}
      </div>
      <label className="shutter" aria-label={upload.isPending ? 'Uploading' : 'Take photo'}>
        <input
          className="visually-hidden"
          type="file"
          accept="image/*"
          capture="environment"
          disabled={upload.isPending}
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) upload.mutate(file)
          }}
        />
        {upload.isPending && <span className="pulse" style={{ color: '#fff' }}>…</span>}
      </label>
    </div>
  )
}
