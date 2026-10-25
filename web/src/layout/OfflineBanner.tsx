import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { flushOutbox, type FlushResult } from '../api/client'
import { useOffline } from '../lib/online'
import { useOutboxCount } from '../lib/outbox'
import { useToast } from '../ui/Toast'

export const RETRY_MS = 30_000 // while changes wait and we seem online (server trouble, Wi-Fi without internet)

const changes = (n: number) => `${n} change${n === 1 ? '' : 's'}`

/** Sticky notice at the top while there's no connection or changes made offline still wait; sends
 *  them once we're back, with a toast for what went through and anything the server turned down. */
export function OfflineBanner() {
  const offline = useOffline()
  const waiting = useOutboxCount()
  const toast = useToast()
  const qc = useQueryClient()
  const was = useRef(offline)
  const seen = useRef(new WeakSet<FlushResult>()) // flushes share one result: report it once

  useEffect(() => {
    if (was.current && !offline) toast('Back online')
    was.current = offline
  }, [offline, toast])

  useEffect(() => {
    if (offline || waiting === 0) return
    const send = async () => {
      const r = await flushOutbox()
      if (seen.current.has(r)) return
      seen.current.add(r)
      if (r.sent) qc.invalidateQueries()
      const said = [
        ...(r.sent ? [`${changes(r.sent)} made offline sent`] : []),
        ...r.failed.map((f) => `Couldn't save “${f.label}”: ${f.message}`),
      ]
      if (said.length) toast(said.join(' · ')) // one toast shows at a time
    }
    send()
    const t = setInterval(send, RETRY_MS)
    return () => clearInterval(t)
  }, [offline, waiting, qc, toast])

  if (offline) {
    return (
      <div className="offline" role="status">
        <b>You're offline.</b> Showing what was last loaded. Logging, ratings, ticks and photos are kept on this phone and sent when you're back
        {waiting > 0 ? <> · <b>{changes(waiting)} waiting</b></> : null}.
      </div>
    )
  }
  if (waiting > 0) return <div className="offline" role="status">Sending {changes(waiting)} made offline…</div>
  return null
}
