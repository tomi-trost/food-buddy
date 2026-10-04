import { describe, expect, it } from 'vitest'
import { jsonResponse, mockFetch } from '../test/utils'
import { api, ApiError, tokenStore } from './client'

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
})
