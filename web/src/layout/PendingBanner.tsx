import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { api } from '../api/client'
import { banner, isBusy, POLL_BUSY_MS, POLL_IDLE_MS } from '../lib/pending'
import { Photo } from '../ui/Photo'

export const OPEN_ANALYSES = ['analyses', 'open']

/** Photos still being analyzed or waiting to be checked, shown above the tab bar. */
export function PendingBanner() {
  const me = useQuery({ queryKey: ['me'], queryFn: api.me, staleTime: 60_000 })
  const open = useQuery({
    queryKey: OPEN_ANALYSES,
    queryFn: api.openAnalyses,
    refetchInterval: (q) => ((q.state.data ?? []).some(isBusy) ? POLL_BUSY_MS : POLL_IDLE_MS),
  })
  const b = banner(open.data ?? [], me.data?.id)
  if (!b) return null

  return (
    <>
      <div className="pending-space" aria-hidden />
      <div className="pending-wrap" role="status">
        <Link to={b.href} className={`pending${b.busy ? '' : ' ready'}`}>
          <Photo url={b.job.photo_url} emoji="🍽️" alt="" className="pending-photo" />
          <span className="sp">
            <b className={b.busy ? 'pulse' : undefined}>{b.title}</b>
            {b.more > 0 && <small>+{b.more} more waiting</small>}
          </span>
          <span className="pending-act">{b.action}</span>
        </Link>
      </div>
    </>
  )
}
