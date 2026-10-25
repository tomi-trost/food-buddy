import { afterEach, describe, expect, it, vi } from 'vitest'
import { jsonResponse, mockFetch } from '../test/utils'
import { isOffline, reportReachable } from '../lib/online'
import { drop, pending } from '../lib/outbox'
import { AccessBlocked, api, ApiError, flushOutbox, Queued, SessionExpired, tokenStore } from './client'

describe('api client', () => {
  it('stores the token on login and sends it afterwards', async () => {
    const fetch = mockFetch((url) =>
      url.endsWith('/auth/login') ? jsonResponse({ access_token: 'abc' }) : jsonResponse({ id: 1 }),
    )
    await api.login('t@example.com', 'secret')
    expect(tokenStore.get()).toBe('abc')

    await api.me()
    const headers = new Headers(fetch.mock.calls[1][1]?.headers)
    expect(headers.get('Authorization')).toBe('Bearer abc')
  })

  it('clears the token on 401 and surfaces the API message', async () => {
    tokenStore.set('old')
    mockFetch(() => jsonResponse({ detail: 'Not authenticated' }, 401))
    await expect(api.me()).rejects.toEqual(new ApiError(401, 'Not authenticated'))
    expect(tokenStore.get()).toBeNull()
  })

  it('uses the first validation message from a 422', async () => {
    mockFetch(() => jsonResponse({ detail: [{ msg: 'String should have at least 8 characters' }] }, 422))
    await expect(
      api.register({ email: 'a@b.c', password: 'x', name: 'A', household_name: 'H' }),
    ).rejects.toThrow('String should have at least 8 characters')
  })

  it('uploads photos as multipart without forcing a JSON content type', async () => {
    const fetch = mockFetch(() => jsonResponse({ id: 7, status: 'queued' }, 202))
    await api.uploadPhoto(new File(['x'], 'plate.jpg', { type: 'image/jpeg' }))
    const init = fetch.mock.calls[0][1]!
    expect(init.body).toBeInstanceOf(FormData)
    expect(new Headers(init.headers).has('Content-Type')).toBe(false)
  })

  describe('Cloudflare Access session expired (API redirects to its PIN page)', () => {
    afterEach(() => vi.unstubAllGlobals())

    it('sends the whole page through /api/reauth and keeps the app token', async () => {
      tokenStore.set('abc')
      const assign = vi.fn()
      vi.stubGlobal('location', { ...window.location, pathname: '/meals/3', search: '?x=1', assign })
      const fetch = mockFetch(() => ({ type: 'opaqueredirect', status: 0, ok: false }) as Response)

      await expect(api.login('t@example.com', 'secret')).rejects.toBeInstanceOf(SessionExpired)
      expect(fetch.mock.calls[0][1]?.redirect).toBe('manual')
      expect(assign).toHaveBeenCalledWith('/api/reauth?next=%2Fmeals%2F3%3Fx%3D1%26reauth%3D1')
      expect(tokenStore.get()).toBe('abc')
    })

    it('tries the access check only once: back from it and still redirected, it stops and explains', async () => {
      const assign = vi.fn()
      vi.stubGlobal('location', { ...window.location, pathname: '/login', search: '?reauth=1', assign })
      mockFetch(() => ({ type: 'opaqueredirect', status: 0, ok: false }) as Response)

      const error = await api.login('t@example.com', 'secret').catch((e) => e)
      expect(error).toBeInstanceOf(AccessBlocked)
      expect(error.message).toMatch(/Cloudflare's access check didn't stick/)
      expect(assign).not.toHaveBeenCalled() // no endless reloading
    })

    it('spots the marker anywhere in the query', async () => {
      const assign = vi.fn()
      vi.stubGlobal('location', { ...window.location, pathname: '/', search: '?a=1&reauth=1&b=2', assign })
      mockFetch(() => ({ type: 'opaqueredirect', status: 0, ok: false }) as Response)
      await expect(api.me()).rejects.toBeInstanceOf(AccessBlocked)
      expect(assign).not.toHaveBeenCalled()
    })

    it('says there is no connection instead of the browser message when offline', async () => {
      vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Load failed'))))
      await expect(api.me()).rejects.toThrow("Can't reach Food Buddy. Check your connection and try again.")
    })

    it('marks the app offline when the server is unreachable and online again on the next answer', async () => {
      reportReachable(true)
      vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Load failed'))))
      await expect(api.me()).rejects.toBeInstanceOf(ApiError)
      expect(isOffline()).toBe(true)

      mockFetch(() => jsonResponse({ detail: 'Not found' }, 404))
      await expect(api.me()).rejects.toBeInstanceOf(ApiError)
      expect(isOffline()).toBe(false)
    })
  })
})

describe('changes made offline', () => {
  const cook = { meal_type: 'lunch' as const, eaten_on: '2026-10-25', servings_eaten: 1, cooked: false, used_up: [] }
  const networkDown = () => mockFetch(() => Promise.reject(new TypeError('Load failed')))

  it('keeps a change when offline, instead of failing', async () => {
    const fetch = mockFetch(() => jsonResponse({}))
    reportReachable(false)
    await expect(api.cookMeal(3, cook, 'Pasta')).rejects.toBeInstanceOf(Queued)
    expect(fetch).not.toHaveBeenCalled()
    const [kept] = await pending()
    expect(kept).toMatchObject({ path: '/meals/3/cook', method: 'POST', label: 'Log Pasta', json: JSON.stringify(cook) })
  })

  it('keeps it when the request never reached the server, not when the server said no', async () => {
    networkDown()
    await expect(api.checkItem(4, true, 'Milk')).rejects.toBeInstanceOf(Queued)
    expect((await pending()).map((c) => c.label)).toEqual(['Tick Milk'])
    reportReachable(true)
    await drop((await pending())[0].id!)

    mockFetch(() => jsonResponse({ detail: 'Meal not found' }, 404))
    await expect(api.cookMeal(3, cook)).rejects.toEqual(new ApiError(404, 'Meal not found'))
    expect(await pending()).toEqual([])
  })

  it('queues behind older changes so they arrive in order', async () => {
    reportReachable(false)
    await expect(api.checkItem(4, true, 'Milk')).rejects.toBeInstanceOf(Queued)
    reportReachable(true)
    let release!: () => void
    const fetch = mockFetch(() => new Promise<Response>((r) => { release = () => r(jsonResponse({ items: [] })) }))
    await expect(api.checkItem(4, false, 'Milk')).rejects.toBeInstanceOf(Queued) // waits behind the tick…
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1)) // …and both go out, oldest first
    release()
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
    release()
    await vi.waitFor(async () => expect(await pending()).toEqual([]))
    expect(fetch.mock.calls.map(([, i]) => i?.body)).toEqual(['{"checked":true}', '{"checked":false}'])
  })

  it('queues a photo with its form and sends it later', async () => {
    networkDown()
    const photo = new File(['jpeg'], 'p.jpg', { type: 'image/jpeg' })
    await expect(api.uploadPhoto(photo, 'meal', { type: 'lunch', saveOnly: false })).rejects.toBeInstanceOf(Queued)
    const [kept] = await pending()
    expect(kept.label).toBe('Photo of lunch')
    reportReachable(true)
    const fetch = mockFetch(() => jsonResponse({ id: 9, status: 'queued' }, 202))
    expect(await flushOutbox()).toEqual({ sent: 1, failed: [], stopped: false })
    const form = fetch.mock.calls[0][1]!.body as FormData
    expect([fetch.mock.calls[0][0], form.get('meal_type'), (form.get('photo') as File).size > 0]).toEqual(['/api/analyses', 'lunch', true])
  })

  it('sends oldest first, drops what the server turns down and stops when the connection goes', async () => {
    reportReachable(false)
    for (const [id, name] of [[1, 'Pasta'], [2, 'Gone'], [3, 'Soup'], [4, 'Salad']] as const) {
      await api.cookMeal(id, cook, name).catch(() => {})
    }
    reportReachable(true)
    const fetch = mockFetch((url) => {
      if (url === '/api/meals/2/cook') return jsonResponse({ detail: 'Meal not found' }, 404)
      if (url === '/api/meals/4/cook') return Promise.reject(new TypeError('Load failed'))
      return jsonResponse({})
    })
    expect(await flushOutbox()).toEqual({ sent: 2, failed: [{ label: 'Log Gone', message: 'Meal not found' }], stopped: true })
    expect(fetch.mock.calls.map(([u]) => u)).toEqual(['/api/meals/1/cook', '/api/meals/2/cook', '/api/meals/3/cook', '/api/meals/4/cook'])
    expect((await pending()).map((c) => c.label)).toEqual(['Log Salad']) // tried again later
  })

  it('keeps everything when the server has trouble or we are logged out', async () => {
    reportReachable(false)
    await api.cookMeal(1, cook, 'Pasta').catch(() => {})
    reportReachable(true)
    for (const status of [500, 401]) {
      tokenStore.set('tok')
      mockFetch(() => jsonResponse({ detail: 'nope' }, status))
      expect(await flushOutbox()).toMatchObject({ sent: 0, failed: [], stopped: true })
      expect(await pending()).toHaveLength(1)
    }
  })
})
