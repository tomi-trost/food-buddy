import type { AnalysisJob } from '../api/types'

export type Banner = {
  job: AnalysisJob
  title: string
  action: string
  href: string
  busy: boolean // still analyzing
  more: number // other photos waiting
}

const NOUN = { meal: 'meal', snack: 'snack', label: 'label' } as const

/** Ready first (that's what needs you), then failed, then still analyzing; oldest first. */
const RANK = { done: 0, failed: 1, queued: 2, running: 2 } as const

export const POLL_BUSY_MS = 5000 // something is analyzing: notice "ready" quickly
export const POLL_IDLE_MS = 30000 // pick up the partner's new photos

export const isBusy = (job: AnalysisJob) => job.status === 'queued' || job.status === 'running'

export const jobHref = (job: AnalysisJob) => (job.kind === 'meal' ? `/analysis/${job.id}` : `/snack/${job.id}`)

export function banner(jobs: AnalysisJob[], meId: number | undefined): Banner | null {
  const open = jobs.filter((j) => !j.closed)
  if (!open.length) return null
  const job = [...open].sort((a, b) => RANK[a.status] - RANK[b.status])[0]
  const whose = job.by.id === meId ? 'your' : `${job.by.name}'s`
  const noun = NOUN[job.kind]
  const base = { job, href: jobHref(job), busy: isBusy(job), more: open.length - 1 }

  if (job.status === 'failed') {
    return { ...base, title: `Couldn't analyze ${whose} ${noun}`, action: 'Open' }
  }
  if (isBusy(job)) {
    const verb = job.kind === 'label' ? 'Reading' : 'Analyzing'
    const rate = job.kind === 'meal' && !job.my_rating
    return { ...base, title: `${verb} ${whose} ${noun}…`, action: rate ? 'Rate it' : 'Open' }
  }
  const name = job.kind === 'meal' ? job.result?.dish : job.snack?.name
  const what = name ? name.charAt(0).toUpperCase() + name.slice(1) : `${whose.charAt(0).toUpperCase()}${whose.slice(1)} ${noun}`
  return job.kind === 'meal'
    ? { ...base, title: `${what} is ready to check`, action: 'Review' }
    : { ...base, title: `${what} is ready to log`, action: 'Log it' }
}
