import { fireEvent, screen, within } from '@testing-library/react'
import { Route } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { tokenStore } from '../api/client'
import type { Day } from '../api/types'
import { card, ING, me, memberInsights, plan } from '../test/fixtures'
import { jsonResponse, mockFetch, renderAt } from '../test/utils'
import { HomePage } from './HomePage'
import { InsightsPage } from './InsightsPage'

const n = (kcal: number, protein = 0, carbs = 0, fat = 0, fiber = 0, sugar = 0) => ({ kcal, protein, carbs, fat, fiber, sugar })

const day: Day = {
  date: '2026-10-04',
  totals: n(1030, 59, 104, 40, 16, 9),
  entries: [
    { id: 1, meal_type: 'breakfast', name: 'Avocado egg toast', emoji: '🥑', kind: 'meal', snack_kind: null, is_reward: false, meal_id: 5, nutrients: n(410, 17, 34, 24, 9, 3) },
    { id: 2, meal_type: 'lunch', name: 'Chicken rice bowl', emoji: '🍚', kind: 'meal', snack_kind: null, is_reward: false, meal_id: 8, nutrients: n(620, 42, 70, 16, 7, 6) },
  ],
}

function api(over: Record<string, unknown> = {}) {
  return mockFetch((url) => {
    const path = url.split('?')[0]
    if (path in over) return jsonResponse(over[path])
    if (path === '/api/auth/me') return jsonResponse(me())
    if (path === '/api/day') return jsonResponse(day)
    if (path === '/api/plan') return jsonResponse(null)
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
    expect(screen.getByText(/Avocado egg toast/)).toBeInTheDocument()
    expect(screen.getByText('Not logged')).toBeInTheDocument() // dinner
    expect(screen.getByRole('link', { name: 'Log Dinner' })).toHaveAttribute('href', '/snap?type=dinner')
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

  it('asks to invite the partner when alone', async () => {
    api({ '/api/insights': { members: [memberInsights()] } })
    renderAt('/insights', <Route path="/insights" element={<InsightsPage />} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Versus' }))
    expect(await screen.findByText(/Versus starts once your partner joins/)).toBeInTheDocument()
  })
})
