import { useState } from 'react'
import { markSeen, RELEASES, seenRelease, unseen } from '../lib/whatsNew'
import { Icon } from '../ui/Icon'

/** Shown once after the app updated: what changed since the last version this phone saw. */
export function WhatsNew() {
  const [shown, setShown] = useState(() => unseen(RELEASES, seenRelease()))
  if (!shown.length) return null
  const close = () => {
    markSeen(RELEASES[0].id)
    setShown([])
  }
  return (
    <div className="update whatsnew" role="dialog" aria-label="What's new">
      <span className="sp">
        <b>What's new</b>
        <ul>{shown.flatMap((r) => r.notes).map((n) => <li key={n}>{n}</li>)}</ul>
      </span>
      <button className="icon" aria-label="Got it" onClick={close}><Icon name="close" size={18} /></button>
    </div>
  )
}
