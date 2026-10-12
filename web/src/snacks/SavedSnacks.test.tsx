import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { Route } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { tokenStore } from '../api/client'
import type { SavedSnack } from '../api/types'
import { analysisJob, me } from '../test/fixtures'
import { jsonResponse, mockFetch, renderAt } from '../test/utils'
import { MealsPage } from '../pages/MealsPage'
import { SnackPage } from '../pages/SnackPage'
import { LogSnackSheet } from './LogSnackSheet'

const n = (kcal: number, sugar: number) => ({ kcal, protein: 7, carbs: 38, fat: 26, fiber: 0.5, sugar })
const tiramisu: SavedSnack = {
  id: 4, name: 'Tiramisu', emoji: '🍰', kind: 'sweet', per: 'piece', amount: 1, per_unit: n(420, 27),
  photo_url: '/api/snacks/saved/4/photo', last_eaten_on: '2026-10-11',
}

function api(saved: SavedSnack[] = [tiramisu]) {
  return mockFetch((url, init) => {
    const path = url.split('?')[0]
    if (path === '/api/auth/me') return jsonResponse(me())
    if (path === '/api/snacks/saved') return jsonResponse(saved)
    if (path === '/api/snacks/catalog') return jsonResponse([])
    if (path === '/api/snacks/saved/4' && init?.method === 'DELETE') return new Response(null, { status: 204 })
    if (path === '/api/snacks') return jsonResponse({ id: 1, name: 'Tiramisu', kcal: 840, sugar: 54, treat: true, saved_id: 4 }, 201)
    if (path === '/api/analyses/5') {
      return jsonResponse(analysisJob({ id: 5, kind: 'snack', status: 'done', snack: { name: 'Tiramisu', kind: 'sweet', per: 'piece', amount: 1, per_unit: n(420, 27) } }))
    }
    return new Response('img')
  })
}

const sent = (fetch: ReturnType<typeof api>) => {
  const call = fetch.mock.calls.find(([u, i]) => u === '/api/snacks' && i?.method === 'POST')
  return call && JSON.parse(String(call[1]!.body))
}

beforeEach(() => {
  tokenStore.set('tok')
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} }))
})

describe('saved snacks', () => {
  it('saves a photographed snack when the switch is on', async () => {
    const fetch = api()
    renderAt('/snack/5', <><Route path="/" element={<p>home</p>} /><Route path="/snack/:id" element={<SnackPage />} /></>)
    const toggle = await screen.findByRole('switch', { name: /Save to our snacks/ })
    expect(toggle).not.toBeChecked()
    fireEvent.click(toggle)
    fireEvent.click(screen.getByRole('button', { name: 'Log snack' }))
    await screen.findByText('home')
    expect(sent(fetch)).toMatchObject({ name: 'Tiramisu', source: 'photo', analysis_id: 5, save: true })
  })

  it('logs one of our snacks again with its own amount and values', async () => {
    const fetch = api([{ ...tiramisu, per: '100g', amount: 150, per_unit: n(280, 20) }])
    const onClose = vi.fn()
    renderAt('/', <Route path="/" element={<LogSnackSheet open onClose={onClose} />} />)
    const ours = await screen.findByLabelText('Our snacks')
    fireEvent.click(within(ours).getByRole('button', { name: /Tiramisu/ }))
    expect(screen.getByText('Your values from last time. Change them if this one was different.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Log snack' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(sent(fetch)).toMatchObject({ source: 'saved', saved_id: 4, per: '100g', amount: 150, per_unit: { kcal: 280 } })
  })

  it('hides the section when we saved nothing yet', async () => {
    api([])
    renderAt('/', <Route path="/" element={<LogSnackSheet open onClose={() => {}} />} />)
    expect(await screen.findByText('Or pick one')).toBeInTheDocument()
    expect(screen.queryByLabelText('Our snacks')).not.toBeInTheDocument()
  })
})

describe('Meals → Snacks', () => {
  it('lists our snacks, logs one and removes one', async () => {
    const fetch = api()
    renderAt('/meals?type=snacks', <Route path="/meals" element={<MealsPage />} />)
    expect(screen.queryByRole('button', { name: /^Sort/ })).not.toBeInTheDocument()
    fireEvent.click(await screen.findByRole('button', { name: 'Tiramisu' }))
    const sheet = screen.getByRole('dialog', { name: 'Log a snack' })
    expect(within(sheet).queryByRole('button', { name: 'Pick another' })).not.toBeInTheDocument()
    fireEvent.click(within(sheet).getByRole('button', { name: 'Log snack' }))
    expect(await screen.findByText('Tiramisu logged · 54 g treat sugar')).toBeInTheDocument()
    expect(sent(fetch)).toMatchObject({ saved_id: 4, source: 'saved' })

    fireEvent.click(await screen.findByRole('button', { name: 'Tiramisu' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Log a snack' })).getByRole('button', { name: 'Remove from our snacks' }))
    expect(await screen.findByText('Tiramisu removed from our snacks')).toBeInTheDocument()
    expect(fetch.mock.calls.some(([u, i]) => u === '/api/snacks/saved/4' && i?.method === 'DELETE')).toBe(true)
  })

  it('explains how to save one when there are none', async () => {
    api([])
    renderAt('/meals?type=snacks', <Route path="/meals" element={<MealsPage />} />)
    expect(await screen.findByText(/No saved snacks yet/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Snap a snack/ })).toHaveAttribute('href', '/snap?kind=snack')
  })
})
