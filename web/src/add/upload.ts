import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { api } from '../api/client'
import type { MealKind } from '../api/types'
import { OPEN_ANALYSES } from '../layout/PendingBanner'
import { keepOriginal } from '../lib/originals'
import { useToast } from '../ui/Toast'

export type PhotoKind = 'meal' | 'label'
export type MealChoice = { type: MealKind | null; saveOnly: boolean }

/** Send a photo or a typed dish to the model. Meals and snacks (a meal typed Snack, 0025) open
 *  their check screen right away (rate while it runs); labels run in the background, the banner
 *  picks them up. */
export function useFoodUpload(onSent?: () => void) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const toast = useToast()
  const sent = (kind: PhotoKind) => (job: { id: number }) => {
    qc.invalidateQueries({ queryKey: OPEN_ANALYSES })
    onSent?.()
    if (kind === 'meal') {
      navigate(`/analysis/${job.id}`)
    } else {
      toast('Reading the label… it shows up above the tabs when ready')
    }
  }
  const photo = useMutation({
    // camera: the original can go to Photos later, when that's switched on in Settings
    mutationFn: ({ file, kind, meal }: { file: File; kind: PhotoKind; meal?: MealChoice; camera?: boolean }) =>
      api.uploadPhoto(file, kind, kind === 'meal' ? meal : undefined),
    onSuccess: async (job, v) => {
      if (v.camera && v.kind === 'meal') await keepOriginal(job.id, v.file) // before the check screen looks for it
      sent(v.kind)(job)
    },
  })
  const text = useMutation({
    mutationFn: ({ text, meal }: { text: string; meal?: MealChoice }) => api.describe(text, meal),
    onSuccess: (job) => sent('meal')(job),
  })
  return { photo, text, busy: photo.isPending || text.isPending, error: photo.error ?? text.error }
}
