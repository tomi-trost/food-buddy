import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { api } from '../api/client'
import type { MealType } from '../api/types'
import { OPEN_ANALYSES } from '../layout/PendingBanner'
import { useToast } from '../ui/Toast'

export type PhotoKind = 'meal' | 'snack' | 'label'
export type MealChoice = { type: MealType | null; saveOnly: boolean }

/** Send a photo or a typed dish to the model. Meals open their check screen right away
 *  (rate while it runs); snacks and labels run in the background, the banner picks them up. */
export function useFoodUpload(onSent?: () => void) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const toast = useToast()
  const sent = (kind: PhotoKind, typed: boolean) => (job: { id: number }) => {
    qc.invalidateQueries({ queryKey: OPEN_ANALYSES })
    onSent?.()
    if (kind === 'meal') {
      navigate(`/analysis/${job.id}`)
    } else {
      const what = kind === 'label' ? 'Reading the label' : typed ? 'Estimating your snack' : 'Analyzing your snack'
      toast(`${what}… it shows up above the tabs when ready`)
    }
  }
  const photo = useMutation({
    mutationFn: ({ file, kind, meal }: { file: File; kind: PhotoKind; meal?: MealChoice }) =>
      api.uploadPhoto(file, kind, kind === 'meal' ? meal : undefined),
    onSuccess: (job, v) => sent(v.kind, false)(job),
  })
  const text = useMutation({
    mutationFn: ({ text, kind, meal }: { text: string; kind: 'meal' | 'snack'; meal?: MealChoice }) =>
      api.describe(kind, text, kind === 'meal' ? meal : undefined),
    onSuccess: (job, v) => sent(v.kind, true)(job),
  })
  return { photo, text, busy: photo.isPending || text.isPending, error: photo.error ?? text.error }
}
