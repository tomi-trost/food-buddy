import { useEffect, useRef } from 'react'
import { useOffline } from '../lib/online'
import { useToast } from '../ui/Toast'

/** Sticky notice at the top while there's no connection; a toast when it comes back. */
export function OfflineBanner() {
  const offline = useOffline()
  const toast = useToast()
  const was = useRef(offline)

  useEffect(() => {
    if (was.current && !offline) toast('Back online')
    was.current = offline
  }, [offline, toast])

  if (!offline) return null
  return (
    <div className="offline" role="status">
      <b>You're offline.</b> Showing what was last loaded; changes won't save until you're back.
    </div>
  )
}
