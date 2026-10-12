import { screen, within } from '@testing-library/react'
import { Route } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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
