// Web Push handlers, pulled into the generated service worker (vite.config.ts → importScripts).
// Payload from the API: { title, body, url, tag }.

self.addEventListener('push', (event) => {
  let msg = { title: 'Food Buddy', body: '', url: '/', tag: 'food-buddy' }
  try {
    msg = { ...msg, ...event.data.json() }
  } catch {
    /* no or non-JSON payload: show the default */
  }
  // iOS revokes push for apps that receive one without showing a notification, so always show it
  event.waitUntil(
    self.registration.showNotification(msg.title, {
      body: msg.body,
      tag: msg.tag,
      data: { url: msg.url },
      icon: '/icon-192.png',
      badge: '/icon-192.png',
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin)
      if (open) {
        await open.focus()
        return open.navigate(url)
      }
      return self.clients.openWindow(url)
    })(),
  )
})
