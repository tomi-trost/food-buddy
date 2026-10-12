import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../api/client'
import type { PushConfig, PushKind } from '../api/types'
import { currentSubscription, disablePush, enablePush, pushSupport } from '../lib/push'
import { useToast } from '../ui/Toast'

const KINDS: { kind: PushKind; title: (partner: string) => string; hint: string }[] = [
  { kind: 'ready', title: () => 'Photo analyzed', hint: 'A meal or snack is ready to check' },
  { kind: 'rate', title: () => 'Rate after eating', hint: 'About 1½ hours after posting a meal' },
  { kind: 'partner', title: (p) => `${p} rated`, hint: "When they rate a meal you haven't yet" },
  { kind: 'shared', title: (p) => `${p} logged a meal`, hint: 'Asks if you ate it too' },
  { kind: 'daily', title: () => 'Evening reminder', hint: 'Meals to rate and photos to check, around 8 pm' },
]

const CONFIG = ['push', 'config']
const DEVICE = ['push', 'device']

export function NotificationSettings({ partner }: { partner: string }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [support] = useState(pushSupport)
  const config = useQuery({ queryKey: CONFIG, queryFn: api.pushConfig })
  const device = useQuery({ queryKey: DEVICE, queryFn: currentSubscription, enabled: support === 'ok' })
  const on = !!device.data

  const enable = useMutation({
    mutationFn: () => enablePush(config.data!.public_key!),
    onSuccess: () => qc.invalidateQueries({ queryKey: DEVICE }),
  })
  const disable = useMutation({
    mutationFn: disablePush,
    onSuccess: () => qc.invalidateQueries({ queryKey: DEVICE }),
  })
  const prefs = useMutation({
    mutationFn: (off: PushKind[]) => api.pushPrefs(off),
    onSuccess: (updated: PushConfig) => qc.setQueryData(CONFIG, updated),
  })
  const test = useMutation({
    mutationFn: api.pushTest,
    onSuccess: ({ sent }) => toast(sent ? 'Sent: it should pop up in a moment' : 'No device got it: turn notifications off and on again'),
  })
  const error = [enable, disable, prefs, test].find((m) => m.isError)?.error

  let body
  if (!config.data) {
    body = config.isError ? <p className="sub">Couldn't load notification settings.</p> : null
  } else if (!config.data.enabled) {
    body = <p className="sub">Notifications aren't set up on the server yet.</p>
  } else if (support === 'install') {
    body = (
      <p className="sub">
        On iPhone, notifications work in the Home Screen app: tap <b>Share → Add to Home Screen</b>, then open Food Buddy
        from there and turn them on here.
      </p>
    )
  } else if (support === 'unsupported') {
    body = <p className="sub">This browser can't show notifications.</p>
  } else if (support === 'denied') {
    body = <p className="sub">Notifications are blocked. Allow them in the phone's Settings → Notifications → Food Buddy.</p>
  } else if (!on) {
    body = (
      <>
        <p className="sub" style={{ marginTop: 0 }}>Get a nudge when a photo is analyzed and when it's time to rate.</p>
        <button className="btn" disabled={enable.isPending || device.isPending} onClick={() => enable.mutate()}>
          Turn on notifications
        </button>
      </>
    )
  } else {
    const off = config.data.off
    body = (
      <>
        <div className="list">
          {KINDS.map(({ kind, title, hint }) => (
            <label key={kind} className="switch-row">
              <span className="sp"><b>{title(partner)}</b><small className="sub">{hint}</small></span>
              <input type="checkbox" role="switch" className="switch" checked={!off.includes(kind)}
                disabled={prefs.isPending}
                onChange={(e) => prefs.mutate(e.target.checked ? off.filter((k) => k !== kind) : [...off, kind])} />
            </label>
          ))}
        </div>
        <div className="row" style={{ marginTop: 12, gap: 8 }}>
          <button className="btn sm ghost" disabled={test.isPending} onClick={() => test.mutate()}>Send a test</button>
          <button className="btn sm ghost" disabled={disable.isPending} onClick={() => disable.mutate()}>Turn off on this phone</button>
        </div>
      </>
    )
  }

  return (
    <>
      <h2>Notifications</h2>
      <div className="card">
        {body}
        {error && <p className="error" role="alert">{error.message}</p>}
      </div>
    </>
  )
}
