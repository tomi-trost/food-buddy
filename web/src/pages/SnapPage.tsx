import { useMutation } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router'
import { api } from '../api/client'

export function SnapPage() {
  const navigate = useNavigate()
  const upload = useMutation({
    mutationFn: api.uploadPhoto,
    onSuccess: (job) => navigate(`/analysis/${job.id}`),
  })

  return (
    <main className="screen">
      <Link to="/" className="sub">← Back</Link>
      <h1>Snap your meal</h1>
      <p className="sub">Take a photo from above with the whole plate in view.</p>
      <label className="btn primary">
        {upload.isPending ? 'Uploading…' : 'Take or choose a photo'}
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
      </label>
      {upload.isError && <p className="error" role="alert">{upload.error.message}</p>}
    </main>
  )
}
