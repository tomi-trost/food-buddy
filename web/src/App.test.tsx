import { screen, within } from '@testing-library/react'
import { Route } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import { tokenStore } from './api/client'
import { me } from './test/fixtures'
import { jsonResponse, mockFetch, renderAt } from './test/utils'

beforeEach(() => {
  tokenStore.set('tok')
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }))
})

function serve() {
  mockFetch((url) => {
    if (url === '/api/auth/me') return jsonResponse(me())
    if (url.startsWith('/api/day')) return jsonResponse({ date: '2026-10-04', totals: { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0 }, entries: [] })
    return jsonResponse([])
  })
}

describe('old /snap links', () => {
  it('open the Add food sheet on Home with the meal type', async () => {
    serve()
    renderAt('/snap?type=lunch', <Route path="*" element={<App />} />)
    const sheet = await screen.findByRole('dialog', { name: 'Add food' })
    expect(within(sheet).getByRole('button', { name: 'Lunch' })).toHaveAttribute('aria-pressed', 'true')
    expect(await screen.findByRole('heading', { name: /^Hi/ })).toBeInTheDocument()
  })

  it('open the snack sheet for snack links', async () => {
    serve()
    renderAt('/snap?kind=snack', <Route path="*" element={<App />} />)
    expect(await screen.findByRole('dialog', { name: 'Log a snack' })).toBeInTheDocument()
  })
})

describe('signed-in screens when /me fails', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('go to login when the token is no longer valid', async () => {
    mockFetch(() => jsonResponse({ detail: 'Not authenticated' }, 401))
    renderAt('/', <Route path="*" element={<App />} />)
    expect(await screen.findByRole('form', { name: 'Log in' })).toBeInTheDocument()
    expect(tokenStore.get()).toBeNull()
  })

  it("stay in the app while offline instead of bouncing to login", async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Load failed'))))
    renderAt('/', <Route path="*" element={<App />} />)
    expect(await screen.findByRole('status')).toHaveTextContent(/offline/)
    expect(screen.queryByRole('form', { name: 'Log in' })).not.toBeInTheDocument()
    expect(tokenStore.get()).toBe('tok')
  })

  it("show why on the login page when Cloudflare Access still won't let us through", async () => {
    vi.stubGlobal('location', { ...window.location, pathname: '/', search: '?reauth=1', assign: vi.fn() })
    mockFetch(() => ({ type: 'opaqueredirect', status: 0, ok: false }) as Response)
    renderAt('/', <Route path="*" element={<App />} />)
    expect(await screen.findByText(/access check didn't stick/)).toBeInTheDocument()
    expect(screen.getByRole('form', { name: 'Log in' })).toBeInTheDocument()
  })
})
