import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { Route } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { tokenStore } from '../api/client'
import type { Day } from '../api/types'
import { card, ING, logEntry, me, meal, memberInsights, plan, reward } from '../test/fixtures'
import { jsonResponse, mockFetch, renderAt } from '../test/utils'
import { HomePage } from './HomePage'
import { InsightsPage } from './InsightsPage'

const n = (kcal: number, protein = 0, carbs = 0, fat = 0, fiber = 0, sugar = 0) => ({ kcal, protein, carbs, fat, fiber, sugar })

const day: Day = {
  date: '2026-10-04',
  totals: n(1030, 59, 104, 40, 16, 9),
  entries: [
    logEntry({ id: 1, meal_type: 'breakfast', name: 'Avocado egg toast', emoji: '🥑', meal_id: 5, nutrients: n(410, 17, 34, 24, 9, 3), logged_at: '2026-10-04T08:10:00' }),
    logEntry({ id: 2, meal_type: 'lunch', name: 'Chicken rice bowl', emoji: '🍚', meal_id: 8, nutrients: n(620, 42, 70, 16, 7, 6), logged_at: '2026-10-04T12:40:00' }),
  ],
}

function api(over: Record<string, unknown> = {}) {
  return mockFetch((url) => {
    const path = url.split('?')[0]
    if (path in over) return jsonResponse(over[path])
    if (path === '/api/auth/me') return jsonResponse(me())
    if (path === '/api/day') return jsonResponse(day)
    if (path === '/api/plan') return jsonResponse(null)
    if (path === '/api/rewards') return jsonResponse([reward({ available: 0 }), reward({ user_id: 2, name: 'Partner', available: 0, used: 1 })])
    if (path === '/api/meals') return jsonResponse([card({ id: 7, name: 'Lentil soup', rated_by_me: false, last_cooked: '2026-10-03' }), card({ id: 8, name: 'Bowl', rated_by_me: true, score: 4.4 })])
    if (path === '/api/inventory') return jsonResponse([
      { ingredient: ING.chicken, grams: 300, expires_on: '2026-10-05', days_left: 1 },
      { ingredient: ING.rice, grams: 500, expires_on: '2026-12-01', days_left: 58 },
    ])
    if (path === '/api/insights') return jsonResponse({ members: [memberInsights(), memberInsights({ user_id: 2, name: 'Partner', color: '#5d8582', meals_rated: 1, days: memberInsights().days.map((d) => ({ ...d, fiber: 10, protein: 90 })) })] })
    return jsonResponse({})
  })
}

beforeEach(() => {
  tokenStore.set('tok')
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 4, 12))
})

describe('HomePage', () => {
  it('shows today\'s ring, bars and what was eaten per meal', async () => {
    api()
    renderAt('/', <Route path="/" element={<HomePage />} />)
    expect(await screen.findByRole('img', { name: '1030 of 2200 kcal' })).toBeInTheDocument()
    const ring = screen.getByRole('link', { name: "Today's nutrition" })
    expect(within(ring).getByText('59 / 110 g')).toBeInTheDocument() // protein vs goal
    expect(within(ring).getByText('104 / 250 g')).toBeInTheDocument() // carbs vs mock reference
    // one row per nutrient: icon + name, bar, amount
    const rows = [...ring.querySelectorAll('.mbar')]
    expect(rows.map((r) => r.querySelector('.mbar-name')!.textContent)).toEqual(['protein', 'carbs', 'fat', 'fiber', 'sugar'])
    expect(rows[0]).toHaveTextContent('protein59 / 110 g')
    expect(screen.getByText(/Avocado egg toast/)).toBeInTheDocument()
    expect(screen.getByText('Not logged')).toBeInTheDocument() // dinner
    expect(screen.getByRole('button', { name: 'Log Dinner' })).toBeInTheDocument()
  })

  it('adds a meal to a slot from our meals, or offers to snap one', async () => {
    const fetch = api({
      '/api/meals': [card({ id: 1, name: 'Oats', types: ['breakfast'] }), card({ id: 3, name: 'Chicken rice bowl', types: ['dinner'] })],
      '/api/meals/3': meal(),
      '/api/meals/3/cook': meal(),
    })
    const cooked = () => {
      const call = fetch.mock.calls.find(([url]) => String(url).endsWith('/cook'))
      return call && JSON.parse(String(call[1]!.body))
    }
    renderAt('/', <Route path="/" element={<HomePage />} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Log Dinner' }))
    const picker = screen.getByRole('dialog', { name: 'Add Dinner' })
    expect(within(picker).getByRole('link', { name: /Snap a photo/ })).toHaveAttribute('href', '/snap?type=dinner')
    const names = () => within(within(picker).getByLabelText('Your meals')).getAllByRole('button').map((b) => b.textContent)
    await waitFor(() => expect(names()[0]).toMatch(/Chicken rice bowl/)) // dinner meals first

    fireEvent.change(within(picker).getByLabelText('Search meals'), { target: { value: 'pizza' } })
    expect(within(picker).getByText('No meal matches.')).toBeInTheDocument()
    fireEvent.change(within(picker).getByLabelText('Search meals'), { target: { value: 'rice' } })
    fireEvent.click(within(picker).getByRole('button', { name: /Chicken rice bowl/ }))

    const sheet = await screen.findByRole('dialog', { name: 'Log this meal' })
    expect(within(sheet).getByRole('button', { name: 'Dinner' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(within(sheet).getByRole('button', { name: 'Log 552 kcal' }))
    await waitFor(() => expect(cooked()).toMatchObject({ meal_type: 'dinner', eaten_on: '2026-10-04', cooked: true }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('lists snacks between the meals by time and edits a meal entry', async () => {
    const cake = logEntry({
      id: 3, meal_type: 'snack', kind: 'snack', snack_kind: 'sweet', name: 'Cake slice', emoji: '🍰', meal_id: null,
      nutrients: n(350, 4, 45, 17, 1, 30), logged_at: '2026-10-04T10:20:00', per: 'piece', per_unit: n(350, 4, 45, 17, 1, 30),
    })
    const fetch = mockFetch((url, init) => {
      if (init?.method === 'PATCH') return jsonResponse(day.entries[1])
      if (url.startsWith('/api/day')) return jsonResponse({ ...day, entries: [...day.entries, cake] })
      if (url.startsWith('/api/auth/me')) return jsonResponse(me())
      return jsonResponse(url.startsWith('/api/meals') || url.startsWith('/api/inventory') || url.startsWith('/api/rewards') ? [] : null)
    })
    renderAt('/', <Route path="/" element={<HomePage />} />)
    const today = await screen.findByLabelText('Today')
    await within(today).findByText(/Cake slice/)
    const rows = [...today.children].map((r) => r.textContent!.replace(/\s+/g, ' ').trim())
    expect(rows[0]).toMatch(/^Breakfast.*Avocado egg toast/)
    expect(rows[1]).toMatch(/^10:20.*Cake slice · 350 kcal/)
    expect(rows[2]).toMatch(/^Lunch.*Chicken rice bowl/)

    expect(within(today).getByRole('link', { name: /Chicken rice bowl/ })).toHaveAttribute('href', '/meals/8')
    fireEvent.click(within(today).getByRole('button', { name: 'Change Chicken rice bowl' }))
    const sheet = screen.getByRole('dialog', { name: 'What you ate' })
    expect(within(sheet).getByRole('link', { name: 'Open the meal' })).toHaveAttribute('href', '/meals/8')
    fireEvent.click(within(sheet).getByLabelText('Less portions eaten'))
    expect(within(sheet).getByTestId('macro-kcal')).toHaveTextContent('310') // 620 × 0.5
    fireEvent.click(within(sheet).getByRole('button', { name: 'Dinner' }))
    fireEvent.click(within(sheet).getByRole('button', { name: 'Save' }))
    await screen.findByText('Updated')
    const [url, init] = fetch.mock.calls.find(([, i]) => i?.method === 'PATCH')!
    expect(url).toBe('/api/log/2')
    expect(JSON.parse(String(init!.body))).toEqual({ servings: 0.5, meal_type: 'dinner' })
  })

  it('changes a logged snack\'s amount and values, or removes an entry', async () => {
    const cake = logEntry({
      id: 3, meal_type: 'snack', kind: 'snack', snack_kind: 'sweet', name: 'Cake slice', emoji: '🍰', meal_id: null,
      nutrients: n(350, 4, 45, 17, 1, 30), logged_at: '2026-10-04T10:20:00', per: 'piece', per_unit: n(350, 4, 45, 17, 1, 30),
    })
    const fetch = mockFetch((url, init) => {
      if (init?.method === 'PATCH') return jsonResponse(cake)
      if (init?.method === 'DELETE') return new Response(null, { status: 204 })
      if (url.startsWith('/api/day')) return jsonResponse({ ...day, entries: [cake] })
      if (url.startsWith('/api/auth/me')) return jsonResponse(me())
      return jsonResponse(url.startsWith('/api/meals') || url.startsWith('/api/inventory') || url.startsWith('/api/rewards') ? [] : null)
    })
    renderAt('/', <Route path="/" element={<HomePage />} />)
    fireEvent.click(await screen.findByRole('button', { name: /Cake slice/ }))
    let sheet = screen.getByRole('dialog', { name: 'What you ate' })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Edit values' }))
    fireEvent.change(within(sheet).getByLabelText('sugar (g)'), { target: { value: '9' } })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Done' }))
    fireEvent.click(within(sheet).getByRole('button', { name: 'Save' }))
    await screen.findByText('Updated')
    const [, init] = fetch.mock.calls.find(([, i]) => i?.method === 'PATCH')!
    expect(JSON.parse(String(init!.body))).toEqual({ servings: 1, per_unit: { ...n(350, 4, 45, 17, 1, 30), sugar: 9 } })

    fireEvent.click(screen.getByRole('button', { name: /Cake slice/ }))
    sheet = screen.getByRole('dialog', { name: 'What you ate' })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Remove from today' }))
    await screen.findByText('Cake slice removed from today')
    expect(fetch.mock.calls.find(([, i]) => i?.method === 'DELETE')![0]).toBe('/api/log/3')
  })

  it('suggests planning, rating and using food soon', async () => {
    api()
    renderAt('/', <Route path="/" element={<HomePage />} />)
    expect(await screen.findByText('Plan the week')).toBeInTheDocument()
    expect(await screen.findByText('Lentil soup')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Rate now' })).toHaveAttribute('href', '/meals/7?rate=1')
    expect(await screen.findByText(/Chicken breast/)).toBeInTheDocument()
    expect(screen.queryByText(/Rice \(cooked\)/)).not.toBeInTheDocument() // not expiring
  })

  it('shows today\'s planned meals once the menu is approved', async () => {
    const p = plan({ status: 'approved' })
    p.days[0] = { ...p.days[0], date: '2026-10-04' } // today
    api({ '/api/plan': p })
    renderAt('/', <Route path="/" element={<HomePage />} />)
    expect(await screen.findByText('Planned today')).toBeInTheDocument()
    expect(screen.getByText('10 min to cook')).toBeInTheDocument() // toast, 10 min
    expect(screen.getByText('Meal prep')).toBeInTheDocument()
  })
})

describe('InsightsPage', () => {
  it('overview shows calories, macro split, fiber and top rated', async () => {
    api()
    renderAt('/insights', <Route path="/insights" element={<InsightsPage />} />)
    expect(await screen.findByText(/avg 2150 · goal 2200/)).toBeInTheDocument()
    expect(screen.getByRole('table', { name: 'Calories per day' })).toHaveTextContent('2026-10-04: 2300 kcal')
    expect(screen.getByLabelText('Macro split')).toHaveTextContent(/Protein\d+%/)
    expect(screen.getByText('3 of 7 days hit · avg 27 g')).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: /Bowl/ })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Day' }))
    expect(screen.getByText('0 of 1 days hit · avg 24 g')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Partner' }))
    expect(screen.getByText('0 of 1 days hit · avg 10 g')).toBeInTheDocument()
  })

  it('versus scores categories and tracks the weekly challenge', async () => {
    api()
    renderAt('/insights', <Route path="/insights" element={<InsightsPage />} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Versus' }))
    expect(await screen.findByLabelText('Your points')).toHaveTextContent('4')
    expect(screen.getByText('You lead · 5 categories')).toBeInTheDocument()
    expect(screen.getByText('3/5')).toBeInTheDocument() // fiber days
    fireEvent.click(screen.getByRole('button', { name: 'Protein push' }))
    expect(screen.getByText('Hit 110 g protein on 5 days')).toBeInTheDocument()
  })

  it('opens on the tab from the link', async () => {
    api()
    renderAt('/insights?tab=snacks', <Route path="/insights" element={<InsightsPage />} />)
    expect(await screen.findByRole('button', { name: 'Snacks' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('asks to invite the partner when alone', async () => {
    api({ '/api/insights': { members: [memberInsights()] } })
    renderAt('/insights', <Route path="/insights" element={<InsightsPage />} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Versus' }))
    expect(await screen.findByText(/Versus starts once your partner joins/)).toBeInTheDocument()
  })
})
