import { fireEvent, screen, waitFor } from '@testing-library/react'
import { Route } from 'react-router'
import { describe, expect, it } from 'vitest'
import { tokenStore } from '../api/client'
import { me } from '../test/fixtures'
import { jsonResponse, mockFetch, renderAt } from '../test/utils'
import { SettingsSheet } from './SettingsSheet'

const routes = (
  <>
    <Route path="/" element={<SettingsSheet open onClose={() => {}} />} />
    <Route path="/login" element={<p>login page</p>} />
  </>
)

describe('SettingsSheet', () => {
  it('saves goals and household settings through the API', async () => {
    tokenStore.set('tok')
    const fetch = mockFetch((_url, init) => {
      if (init?.method === 'PATCH') {
        const body = JSON.parse(String(init.body))
        return jsonResponse(me({ goals: { ...me().goals, kcal: body.goal_kcal ?? 2200 } }))
      }
      return jsonResponse(me())
    })
    renderAt('/', routes)

    fireEvent.click(await screen.findByLabelText('More kcal goal'))
    await waitFor(() => expect(screen.getByRole('group', { name: 'kcal goal' })).toHaveTextContent('2250'))
    const patch = fetch.mock.calls.find(([, init]) => init?.method === 'PATCH')!
    expect(patch[0]).toBe('/api/auth/me')
    expect(JSON.parse(String(patch[1]!.body))).toEqual({ goal_kcal: 2250 })

    fireEvent.click(screen.getByLabelText('More treat-free days per croissant'))
    await waitFor(() =>
      expect(fetch.mock.calls.some(([url]) => url === '/api/household')).toBe(true),
    )
  })

  it('shows members, invite code and switches accent', async () => {
    tokenStore.set('tok')
    mockFetch(() => jsonResponse(me()))
    renderAt('/', routes)

    expect(await screen.findByText('inv123')).toBeInTheDocument()
    expect(screen.getByText('Tomi (you)')).toBeInTheDocument()
    expect(screen.getByText('Partner')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Plum'))
    expect(screen.getByLabelText('Plum')).toHaveAttribute('aria-pressed', 'true')
    expect(localStorage.getItem('fb.accent')).toBe('plum')
  })

  it('logs out', async () => {
    tokenStore.set('tok')
    mockFetch(() => jsonResponse(me()))
    renderAt('/', routes)
    fireEvent.click(await screen.findByText('Log out'))
    expect(await screen.findByText('login page')).toBeInTheDocument()
    expect(tokenStore.get()).toBeNull()
  })
})
