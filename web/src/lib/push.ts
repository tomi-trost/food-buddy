import { api } from '../api/client'

/** ok: can subscribe · install: iPhone Safari tab, needs Add to Home Screen first ·
 *  denied: the user blocked notifications · unsupported: this browser can't */
export type PushSupport = 'ok' | 'install' | 'denied' | 'unsupported'

const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent)
const isStandalone = () =>
  matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true

export function pushSupport(): PushSupport {
  const capable = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  if (!capable) return isIOS() && !isStandalone() ? 'install' : 'unsupported'
  return Notification.permission === 'denied' ? 'denied' : 'ok'
}

/** VAPID public key (base64url) → bytes for PushManager.subscribe */
export function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const b64 = base64url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (base64url.length % 4)) % 4)
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
}

async function registration() {
  return navigator.serviceWorker.ready
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (pushSupport() !== 'ok') return null
  return (await registration()).pushManager.getSubscription()
}

/** Must run from a tap: iOS only shows the permission prompt for a user gesture. */
export async function enablePush(publicKey: string): Promise<void> {
  if ((await Notification.requestPermission()) !== 'granted') throw new Error('Notifications were not allowed')
  const reg = await registration()
  const sub = (await reg.pushManager.getSubscription())
    ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }))
  await api.pushSubscribe(sub.toJSON())
}

export async function disablePush(): Promise<void> {
  const sub = await currentSubscription()
  if (!sub) return
  await api.pushUnsubscribe(sub.endpoint)
  await sub.unsubscribe()
}

/** On app start: re-send this device's subscription (it can rotate, or another person logged in). */
export async function syncPush(): Promise<void> {
  if (pushSupport() !== 'ok' || Notification.permission !== 'granted') return
  const sub = await currentSubscription()
  if (sub) await api.pushSubscribe(sub.toJSON())
}
