import { useEffect, useRef, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { watchForUpdates } from '../lib/swUpdate'
import { Icon } from '../ui/Icon'

/** "New version" popup: a new build is installed and waiting; one tap reloads into it. */
export function UpdatePrompt() {
  const stop = useRef<() => void>(undefined)
  const [busy, setBusy] = useState(false)
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW: (_url, registration) => {
      if (registration) stop.current = watchForUpdates(registration)
    },
  })
  useEffect(() => () => stop.current?.(), [])

  if (!needRefresh) return null
  return (
    <div className="update" role="alertdialog" aria-label="Update available">
      <span className="sp"><b>New version available</b><small>Reload to get the latest Food Buddy.</small></span>
      <button className="btn" style={{ width: 'auto', padding: '0 16px' }} disabled={busy}
        onClick={() => { setBusy(true); updateServiceWorker() }}>
        {busy ? 'Reloading…' : 'Reload'}
      </button>
      <button className="icon" aria-label="Later" onClick={() => setNeedRefresh(false)}><Icon name="close" size={18} /></button>
    </div>
  )
}
