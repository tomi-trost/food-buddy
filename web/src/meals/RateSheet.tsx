import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { Meal, Rating } from '../api/types'
import { Sheet } from '../ui/Sheet'
import { useToast } from '../ui/Toast'
import { DEFAULT_RATING, RatingFields } from './RatingFields'

export function RateSheet({ meal, meId, open, onClose }: { meal: Meal; meId: number; open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const existing = meal.ratings.find((r) => r.user_id === meId)?.rating
  const [draft, setDraft] = useState<Rating>(existing ?? DEFAULT_RATING)
  useEffect(() => {
    if (open) setDraft(existing ?? DEFAULT_RATING)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const save = useMutation({
    mutationFn: () => api.rateMeal(meal.id, draft),
    onSuccess: (updated) => {
      qc.setQueryData(['meal', String(meal.id)], updated)
      qc.invalidateQueries({ queryKey: ['meals'] })
      onClose()
      const partnerDone = updated.ratings.filter((r) => r.user_id !== meId).every((r) => r.rating)
      toast(partnerDone ? 'Rating saved' : 'Rating saved — waiting for partner')
    },
  })
  const set = (patch: Partial<Rating>) => setDraft((d) => ({ ...d, ...patch }))

  return (
    <Sheet open={open} onClose={onClose} label="Rate meal">
      <h1>Rate {meal.name}</h1>
      <RatingFields draft={draft} set={set} />
      {save.isError && <p className="error" role="alert">{save.error.message}</p>}
      <button className="btn" style={{ marginTop: 20 }} disabled={save.isPending} onClick={() => save.mutate()}>
        Save rating
      </button>
    </Sheet>
  )
}
