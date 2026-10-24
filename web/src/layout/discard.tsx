import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { api } from '../api/client'
import type { AnalysisJob } from '../api/types'
import { Icon } from '../ui/Icon'
import { useToast } from '../ui/Toast'
import { OPEN_ANALYSES } from './PendingBanner'

/** Discard a photo (still analyzing or ready to check), with Undo in the toast. */
export function useDiscardPhoto() {
  const qc = useQueryClient()
  const toast = useToast()
  const show = (job: AnalysisJob) => {
    qc.setQueryData(['analysis', String(job.id)], job)
    qc.setQueryData<AnalysisJob[]>(OPEN_ANALYSES, (jobs) => (job.closed ? jobs?.filter((j) => j.id !== job.id) : jobs))
    qc.invalidateQueries({ queryKey: OPEN_ANALYSES })
  }
  return useMutation({
    mutationFn: (id: number) => api.discardAnalysis(id),
    onSuccess: (job) => {
      show(job)
      toast('Photo discarded', {
        undo: () => {
          api.reopenAnalysis(job.id).then(show, () => toast("Couldn't bring the photo back"))
        },
      })
    },
  })
}

/** Top-bar trash: drop the photo (Undo in the toast) and go home. */
export function DiscardButton({ id }: { id: number }) {
  const navigate = useNavigate()
  const discard = useDiscardPhoto()
  return (
    <button className="icon" aria-label="Discard this photo" disabled={discard.isPending}
      onClick={() => discard.mutate(id, { onSuccess: () => navigate('/', { replace: true }) })}>
      <Icon name="trash" />
    </button>
  )
}
