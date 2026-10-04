import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { Route } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { tokenStore } from '../api/client'
import type { LogEntry } from '../api/types'
import { analysisJob, me, memberInsights, reward } from '../test/fixtures'
import { jsonResponse, mockFetch, renderAt } from '../test/utils'
import { SnackPage } from '../pages/SnackPage'
import { SnacksCard } from './SnacksCard'
import { SnacksInsights } from './SnacksInsights'

const n = (kcal: number, sugar: number) => ({ kcal, protein: 2, carbs: 19, fat: 6, fiber: 0.5, sugar })
const cookie: LogEntry = { id: 9, meal_type: 'snack', name: 'Cookie', emoji: '🍪', kind: 'snack', snack_kind: 'sweet', is_reward: false, meal_id: null, nutrients: n(140, 10) }
const catalog = [{ key: 'cookie', name: 'Cookie', emoji: '🍪', kind: 'sweet', per_unit: n(140, 10) }, { key: 'chips', name: 'Chips', emoji: '🥔', kind: 'savory', per_unit: n(210, 1) }]

function api(extra: (url: string, init?: RequestInit) => Response | undefined = () => undefined) {
  return mockFetch((url, init) => {
    const hit = extra(url, init)
    if (hit) return hit
    const path = url.split('?')[0]
    if (path === '/api/auth/me') return jsonResponse(me())
    if (path === '/api/rewards') return jsonResponse([reward()])
    if (path === '/api/rewards/use') return jsonResponse([reward({ available: 0, used: 1 })])
    if (path === '/api/snacks/catalog') return jsonResponse(catalog)
    if (path === '/api/snacks') return jsonResponse({ id: 1, name: 'Cookie', kcal: 140, sugar: 10, treat: true }, 201)
    if (path === '/api/day') return jsonResponse({ date: '2026-10-05', totals: n(140, 10), entries: [cookie] })
    return jsonResponse({})
  })
}

beforeEach(() => {
  tokenStore.set('tok')
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} }))
})

describe('SnacksCard', () => {
  it('shows treat sugar, logs from the list and uses a croissant pass', async () => {
    const fetch = api()
    renderAt('/', <Route path="/" element={<SnacksCard me={me()} entries={[cookie]} />} />)
    expect(screen.getByText('1 snack today · 10 g treat sugar')).toBeInTheDocument()
    expect(await screen.findByText('1 available — you earned it')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Use pass' }))
    expect(await screen.findByText('Enjoy your croissant!')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Log/ }))
    const sheet = screen.getByRole('dialog', { name: 'Log a snack' })
    fireEvent.click(await within(sheet).findByRole('button', { name: /Chips/ }))
    await screen.findByText('Cookie logged · 10 g treat sugar')
    const [, init] = fetch.mock.calls.find(([u]) => u === '/api/snacks')!
    expect(JSON.parse(String(init!.body))).toMatchObject({ name: 'Chips', kind: 'savory', source: 'list', per: 'piece', amount: 1 })
  })

  it('warns when over the sugar goal and shows progress to the next pass', async () => {
    api((url) => (url.startsWith('/api/rewards') ? jsonResponse([reward({ available: 0, progress: 1, per: 3 })]) : undefined))
    const lots = { ...cookie, nutrients: n(500, 80) }
    renderAt('/', <Route path="/" element={<SnacksCard me={me()} entries={[lots]} />} />)
    expect(screen.getByText('Over your 50 g goal')).toBeInTheDocument()
    expect(await screen.findByText('1 / 3 treat-free days to the next one')).toBeInTheDocument()
  })
})

describe('SnackPage', () => {
  it('reads a label, lets you fix the portion and logs per-100 g values', async () => {
    const per100 = n(450, 26)
    const fetch = api((url) =>
      url === '/api/analyses/7'
        ? jsonResponse(analysisJob({ id: 7, kind: 'label', status: 'done', snack: { name: 'Oat bar', kind: 'sweet', per: '100g', amount: 45, per_unit: per100 } }))
        : url.endsWith('/photo') ? new Response('img') : undefined,
    )
    renderAt('/snack/7', (
      <>
        <Route path="/snack/:id" element={<SnackPage />} />
        <Route path="/" element={<p>home</p>} />
      </>
    ))
    expect(await screen.findByRole('heading', { name: 'Oat bar' })).toBeInTheDocument()
    expect(screen.getByText(/Per 100 g: 450 kcal/)).toBeInTheDocument()
    expect(screen.getByTestId('macro-kcal')).toHaveTextContent('203') // 45 g
    fireEvent.click(screen.getByLabelText('More amount')) // 50 g
    expect(screen.getByTestId('macro-kcal')).toHaveTextContent('225')
    fireEvent.click(screen.getByRole('button', { name: 'Log snack' }))
    expect(await screen.findByText('home')).toBeInTheDocument()
    const [, init] = fetch.mock.calls.find(([u]) => u === '/api/snacks')!
    expect(JSON.parse(String(init!.body))).toMatchObject({ source: 'label', per: '100g', amount: 50, per_unit: per100 })
  })
})

describe('SnacksInsights', () => {
  it('summarises treats, rewards and who resists better', async () => {
    api()
    const days = memberInsights().days.map((d, i) => ({ ...d, treats: i % 3 === 0 ? 1 : 0, treat_sugar: i % 3 === 0 ? 60 : 0 }))
    const members = [memberInsights({ days }), memberInsights({ user_id: 2, name: 'Partner', color: '#5d8582' })]
    renderAt('/i', <Route path="/i" element={<SnacksInsights members={members} meId={1} />} />)
    expect(screen.getByLabelText('Treat stats')).toHaveTextContent('4treat-free days3treats this week3days over goal')
    expect(screen.getByRole('table', { name: 'Treat sugar per day' })).toHaveTextContent('60 g treat sugar (over goal)')
    expect(await screen.findByText('Cookie')).toBeInTheDocument()
    expect(screen.getByText('sweets (fewer wins)')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText('Tomi: 1 of 2 days')).toBeInTheDocument())
  })
})
