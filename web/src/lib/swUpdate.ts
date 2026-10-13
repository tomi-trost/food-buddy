/** How often an open app asks the server for a new version (besides each return to the foreground). */
export const CHECK_EVERY_MS = 30 * 60_000

/** Ask for a new service worker now, every `CHECK_EVERY_MS`, and whenever the app comes back to the
 *  foreground: the Home Screen app on iOS resumes without reloading, so it would never look otherwise.
 *  Returns a function that stops watching. */
export function watchForUpdates(registration: ServiceWorkerRegistration): () => void {
  const check = () => {
    if (!navigator.onLine || registration.installing) return
    // Offline or an expired Cloudflare Access session (sw.js redirected): try again later.
    registration.update().catch(() => {})
  }
  const onVisible = () => document.visibilityState === 'visible' && check()
  const timer = setInterval(check, CHECK_EVERY_MS)
  document.addEventListener('visibilitychange', onVisible)
  return () => {
    clearInterval(timer)
    document.removeEventListener('visibilitychange', onVisible)
  }
}
