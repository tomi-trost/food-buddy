import { afterEach, describe, expect, it, vi } from 'vitest'
import { jsonResponse, mockFetch } from '../test/utils'
import { isOffline, reportReachable } from '../lib/online'
import { AccessBlocked, api, ApiError, SessionExpired, tokenStore } from './client'

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
