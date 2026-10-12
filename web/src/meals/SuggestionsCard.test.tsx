import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { Route } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { tokenStore } from '../api/client'
import type { Suggestion } from '../api/types'
import { jsonResponse, mockFetch, renderAt } from '../test/utils'
import { SuggestionsCard } from './SuggestionsCard'

const suggestion = (over: Partial<Suggestion> = {}): Suggestion => ({
  id: 7,
  by: { id: 1, name: 'Tomi', color: '#b9532f' },
  meal: { id: 3, name: 'Chicken rice bowl', emoji: '🍚', photo_url: null, kcal_per_portion: 551.7 },
  meal_type: 'lunch',
  eaten_on: '2026-10-04',
  ...over,
})

function serve(list: Suggestion[]) {
  let current = list
  return mockFetch((url, init) => {
    if (url.startsWith('/api/suggestions?')) return jsonResponse(current)
    if (url.endsWith('/accept') || url.endsWith('/decline')) {
      const id = Number(url.split('/')[3])
      current = current.filter((s) => s.id !== id)
      return url.endsWith('/accept') ? jsonResponse({ log_id: 1 }) : new Response(null, { status: 204 })
    }
    return jsonResponse({}, init?.method ? 200 : 404)
  })
}

const render = () => renderAt('/', <Route path="/" element={<SuggestionsCard />} />)

beforeEach(() => {
  tokenStore.set('tok')
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 4, 13))
})

describe('SuggestionsCard', () => {
  it('asks for today with the local date and logs it on yes', async () => {
    const fetch = serve([suggestion()])
    render()
    const card = await screen.findByRole('region', { name: 'You too?' })
    expect(fetch.mock.calls[0][0]).toBe('/api/suggestions?today=2026-10-04')
    expect(within(card).getByRole('heading', { name: 'Tomi had Chicken rice bowl' })).toBeInTheDocument()
    expect(within(card).getByText('lunch · 552 kcal / portion. You too?')).toBeInTheDocument()

    fireEvent.click(within(card).getByRole('button', { name: 'Yes, log it' }))
    expect(await screen.findByText('Chicken rice bowl logged · tap it in Today to change portions')).toBeInTheDocument()
    const accept = fetch.mock.calls.find(([u]) => String(u).endsWith('/accept'))!
    expect(accept[0]).toBe('/api/suggestions/7/accept')
    expect(JSON.parse(String(accept[1]!.body))).toEqual({ servings_eaten: 1 })
    await waitFor(() => expect(screen.queryByRole('region', { name: 'You too?' })).not.toBeInTheDocument())
  })

  it('says no, and marks yesterday’s meals', async () => {
    const fetch = serve([suggestion(), suggestion({ id: 8, meal_type: 'dinner', eaten_on: '2026-10-03' })])
    render()
    expect(await screen.findByText('Yesterday · dinner · 552 kcal / portion. You too?')).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: 'No' })[0])
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'No' })).toHaveLength(1))
    expect(fetch.mock.calls.some(([u, i]) => u === '/api/suggestions/7/decline' && i?.method === 'POST')).toBe(true)
  })

  it('shows nothing without suggestions', async () => {
    const fetch = serve([])
    render()
    await waitFor(() => expect(fetch).toHaveBeenCalled())
    expect(screen.queryByRole('region', { name: 'You too?' })).not.toBeInTheDocument()
  })
})
