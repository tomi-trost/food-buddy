import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { api } from '../api/client'
import type { Meal } from '../api/types'
import { OPEN_ANALYSES } from '../layout/PendingBanner'
import { useToast } from '../ui/Toast'

/** Right after posting (for whoever posted it): take it all back and check the photo again. */
export function UndoPost({ meal }: { meal: Meal }) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const toast = useToast()
  const until = meal.undo_until ? new Date(meal.undo_until).getTime() : 0
  const [open, setOpen] = useState(() => until > Date.now())
  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => setOpen(false), until - Date.now())
    return () => clearTimeout(t)
  }, [open, until])

  const undo = useMutation({
    mutationFn: () => api.undoMeal(meal.id),
    onSuccess: ({ analysis_id }) => {
      for (const key of [['meals'], ['day'], ['insights'], ['inventory'], ['shopping'], ['suggestions'], OPEN_ANALYSES]) {
        qc.invalidateQueries({ queryKey: key })
      }
      qc.removeQueries({ queryKey: ['meal', String(meal.id)] })
      navigate(analysis_id ? `/analysis/${analysis_id}` : '/', { replace: true })
      toast(analysis_id ? 'Post undone · check the photo again' : 'Post undone')
    },
  })

  if (!open) return null
  return (
    <div className="card row" role="region" aria-label="Undo post">
      <div className="sp">
        <h3>Just posted</h3>
        <div className="sub">Something off? Undo puts your ingredients and the photo back.</div>
        {undo.isError && <div className="error" role="alert">{undo.error.message}</div>}
      </div>
      <button className="btn sm ghost" disabled={undo.isPending} onClick={() => undo.mutate()}>
        {undo.isPending ? 'Undoing…' : 'Undo'}
      </button>
    </div>
  )
}
