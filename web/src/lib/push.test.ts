import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { tokenStore } from '../api/client'
import { jsonResponse, mockFetch } from '../test/utils'
import { disablePush, enablePush, keyBytes, pushSupport, syncPush } from './push'

const SUB_JSON = { endpoint: 'https://web.push.apple.com/abc', keys: { p256dh: 'p', auth: 'a' } }

function fakeBrowser({ permission = 'default', grant = 'granted', existing = false } = {}) {
  const sub = { endpoint: SUB_JSON.endpoint, toJSON: () => SUB_JSON, unsubscribe: vi.fn(async () => true) }
  const pushManager = {
    getSubscription: vi.fn(async () => (existing ? sub : null)),
    subscribe: vi.fn(async () => sub),
  }
  vi.stubGlobal('Notification', Object.assign(function Notification() {}, {
    permission, requestPermission: vi.fn(async () => grant),
  }))
  vi.stubGlobal('PushManager', function PushManager() {})
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { ready: Promise.resolve({ pushManager }) } })
  return { sub, pushManager }
}

beforeEach(() => tokenStore.set('tok'))
afterEach(() => {
  delete (navigator as { serviceWorker?: unknown }).serviceWorker
})

describe('push support', () => {
  it('asks iPhone Safari users to add the app to the Home Screen first', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')
    vi.stubGlobal('matchMedia', () => ({ matches: false })) // a Safari tab, not the Home Screen app
    expect(pushSupport()).toBe('install')
  })

  it('is unsupported in a browser without push', () => {
    expect(pushSupport()).toBe('unsupported')
  })

  it('knows when notifications were blocked', () => {
    fakeBrowser({ permission: 'denied' })
    expect(pushSupport()).toBe('denied')
  })
})

describe('enable / disable', () => {
  it('asks permission, subscribes with the server key and registers the device', async () => {
    const { pushManager } = fakeBrowser()
    const fetch = mockFetch(() => new Response(null, { status: 204 }))
    await enablePush('BAEC')
    expect(pushManager.subscribe).toHaveBeenCalledWith({ userVisibleOnly: true, applicationServerKey: keyBytes('BAEC') })
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe('/api/push/subscription')
    expect(init!.method).toBe('PUT')
    expect(JSON.parse(String(init!.body))).toEqual(SUB_JSON)
  })

  it('stops when the user says no', async () => {
    const { pushManager } = fakeBrowser({ grant: 'denied' })
    const fetch = mockFetch(() => jsonResponse({}))
    await expect(enablePush('BAEC')).rejects.toThrow('Notifications were not allowed')
    expect(pushManager.subscribe).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('reuses an existing subscription', async () => {
    const { pushManager } = fakeBrowser({ existing: true })
    mockFetch(() => new Response(null, { status: 204 }))
    await enablePush('BAEC')
    expect(pushManager.subscribe).not.toHaveBeenCalled()
  })

  it('unsubscribes on the server and in the browser', async () => {
    const { sub } = fakeBrowser({ permission: 'granted', existing: true })
    const fetch = mockFetch(() => new Response(null, { status: 204 }))
    await disablePush()
    expect(fetch.mock.calls[0][0]).toBe('/api/push/unsubscribe')
    expect(JSON.parse(String(fetch.mock.calls[0][1]!.body))).toEqual({ endpoint: SUB_JSON.endpoint })
    expect(sub.unsubscribe).toHaveBeenCalled()
  })

  it('re-sends the subscription on app start only when allowed', async () => {
    fakeBrowser({ permission: 'granted', existing: true })
    const fetch = mockFetch(() => new Response(null, { status: 204 }))
    await syncPush()
    expect(fetch).toHaveBeenCalledTimes(1)

    fakeBrowser({ permission: 'default', existing: true })
    const quiet = mockFetch(() => new Response(null, { status: 204 }))
    await syncPush()
    expect(quiet).not.toHaveBeenCalled()
  })
})

describe('keyBytes', () => {
  it('decodes base64url without padding', () => {
    expect(Array.from(keyBytes('-_8'))).toEqual([0xfb, 0xff])
  })
})
