import { beforeEach, describe, expect, it, vi } from 'vitest'
import code from '../public/push-sw.js?raw'

// Runs public/push-sw.js against a fake service-worker global.
type Listener = (event: unknown) => void

function load() {
  const listeners: Record<string, Listener> = {}
  const win = { url: 'https://app.test/plan', focus: vi.fn(), navigate: vi.fn() }
  const sw = {
    location: { origin: 'https://app.test' },
    addEventListener: (type: string, fn: Listener) => (listeners[type] = fn),
    registration: { showNotification: vi.fn() },
    clients: { matchAll: vi.fn(async () => [] as typeof win[]), openWindow: vi.fn() },
  }
  new Function('self', code)(sw)
  const fire = async (type: string, event: object) => {
    let done: Promise<unknown> = Promise.resolve()
    listeners[type]({ ...event, waitUntil: (p: Promise<unknown>) => (done = p) })
    await done
  }
  return { sw, win, fire }
}

describe('push service worker', () => {
  let t: ReturnType<typeof load>
  beforeEach(() => (t = load()))

  it('shows the notification from the payload', async () => {
    const data = { json: () => ({ title: 'Pasta is ready to check', body: 'Tap to review', url: '/analysis/3', tag: 'job3' }) }
    await t.fire('push', { data })
    expect(t.sw.registration.showNotification).toHaveBeenCalledWith('Pasta is ready to check', expect.objectContaining({
      body: 'Tap to review', tag: 'job3', data: { url: '/analysis/3' },
    }))
  })

  it('still shows something for an empty or broken payload', async () => {
    await t.fire('push', { data: null })
    expect(t.sw.registration.showNotification).toHaveBeenCalledWith('Food Buddy', expect.objectContaining({ data: { url: '/' } }))
  })

  it('opens the linked screen in the running app', async () => {
    t.sw.clients.matchAll.mockResolvedValue([t.win])
    const notification = { close: vi.fn(), data: { url: '/meals/4?rate=1' } }
    await t.fire('notificationclick', { notification })
    expect(notification.close).toHaveBeenCalled()
    expect(t.win.focus).toHaveBeenCalled()
    expect(t.win.navigate).toHaveBeenCalledWith('https://app.test/meals/4?rate=1')
    expect(t.sw.clients.openWindow).not.toHaveBeenCalled()
  })

  it('starts the app when it is closed', async () => {
    await t.fire('notificationclick', { notification: { close: vi.fn(), data: { url: '/analysis/3' } } })
    expect(t.sw.clients.openWindow).toHaveBeenCalledWith('https://app.test/analysis/3')
  })
})
