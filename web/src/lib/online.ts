// Offline = the phone says so, or the last API call couldn't reach the server (iOS often keeps
// navigator.onLine true on a Wi-Fi without internet). The next successful call clears it.

import { useSyncExternalStore } from 'react'

let unreachable = false
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function reportReachable(ok: boolean) {
  if (unreachable === !ok) return
  unreachable = !ok
  emit()
}

export function isOffline() {
  return !navigator.onLine || unreachable
}

function subscribe(listener: () => void) {
  const online = () => {
    unreachable = false // give the server another chance; the next call tells
    listener()
  }
  listeners.add(listener)
  window.addEventListener('online', online)
  window.addEventListener('offline', listener)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('online', online)
    window.removeEventListener('offline', listener)
  }
}

export const useOffline = () => useSyncExternalStore(subscribe, isOffline)
