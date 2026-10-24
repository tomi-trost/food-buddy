import { fireEvent, screen, within } from '@testing-library/react'
import { Route } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { tokenStore } from '../api/client'
import { todayISO } from '../lib/dates'
import type { Day } from '../api/types'
import { card, ING, logEntry, me, memberInsights, plan, reward } from '../test/fixtures'
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

  it("opens Add food with that slot's meal type from Today's +", async () => {
    api()
    renderAt('/', <Route path="/" element={<HomePage />} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Log Breakfast' }))
    const sheet = screen.getByRole('dialog', { name: 'Add food' })
    expect(within(sheet).getByRole('button', { name: 'Breakfast' })).toHaveAttribute('aria-pressed', 'true')
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
    const fetch = api()
    renderAt('/insights', <Route path="/insights" element={<InsightsPage />} />)
    expect(await screen.findByText(/avg 2150 · goal 2200/)).toBeInTheDocument()
    expect(screen.getByRole('table', { name: 'Calories per day' })).toHaveTextContent('2026-10-04: 2300 kcal')
    expect(screen.getByLabelText('Macro split')).toHaveTextContent(/Protein\d+%/)
    expect(screen.getByText('3 of 7 days hit · avg 27 g')).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: /Bowl/ })).toBeInTheDocument()

    const lastDay = (m: ReturnType<typeof memberInsights>) => ({ ...m, days: m.days.slice(-1) })
    const week = { members: [memberInsights(), memberInsights({ user_id: 2, name: 'Partner', color: '#5d8582', days: memberInsights().days.map((d) => ({ ...d, fiber: 10 })) })] }
    fetch.mockImplementation((url) => Promise.resolve(jsonResponse(String(url).includes('days=1&') || String(url).endsWith('days=1')
      ? { members: week.members.map(lastDay) } : week)))
    fireEvent.click(screen.getByRole('button', { name: 'Day' }))
    expect(await screen.findByText('0 of 1 days hit · avg 24 g')).toBeInTheDocument()
    expect(fetch).toHaveBeenCalledWith('/api/insights?end=2026-10-04&days=1', expect.anything())
    fireEvent.click(screen.getByRole('button', { name: 'Partner' }))
    expect(screen.getByText('0 of 1 days hit · avg 10 g')).toBeInTheDocument()
  })

  it('goes back a week at a time with the arrows or a swipe, and never past today', async () => {
    const fetch = api()
    renderAt('/insights', <Route path="/insights" element={<InsightsPage />} />)
    const period = await screen.findByRole('group', { name: 'Period' })
    expect(period).toHaveTextContent('Last 7 days')
    expect(within(period).getByRole('button', { name: 'Later week' })).toBeDisabled()

    fireEvent.click(within(period).getByRole('button', { name: 'Earlier week' }))
    expect(period).toHaveTextContent('21 Sep – 27 Sep')
    expect(fetch).toHaveBeenCalledWith('/api/insights?end=2026-09-27&days=7', expect.anything())

    const chart = screen.getByRole('table', { name: 'Calories per day' }).closest('.card')!
    fireEvent.touchStart(chart, { touches: [{ clientX: 50, clientY: 100 }] })
    fireEvent.touchEnd(chart, { changedTouches: [{ clientX: 200, clientY: 110 }] }) // swipe right: earlier
    expect(period).toHaveTextContent('14 Sep – 20 Sep')
    fireEvent.touchStart(chart, { touches: [{ clientX: 50, clientY: 100 }] })
    fireEvent.touchEnd(chart, { changedTouches: [{ clientX: 60, clientY: 300 }] }) // a scroll, not a swipe
    expect(period).toHaveTextContent('14 Sep – 20 Sep')
    fireEvent.touchStart(chart, { touches: [{ clientX: 200, clientY: 100 }] })
    fireEvent.touchEnd(chart, { changedTouches: [{ clientX: 40, clientY: 100 }] }) // swipe left: later
    expect(period).toHaveTextContent('21 Sep – 27 Sep')

    fireEvent.click(screen.getByRole('button', { name: 'Month' })) // a new range starts at today again
    expect(period).toHaveTextContent('Last 30 days')
  })

  it('shows every nutrient per day, meals eaten per type, and where they come from', async () => {
    const fetch = api({
      '/api/insights/sources': { groups: {
        protein: [{ name: 'Chicken breast', emoji: '🍗', times: 3, grams: 450 }],
        carbs: [], fat: [], fiber: [{ name: 'Chia seeds', emoji: '🌱', times: 5, grams: 60 }], sugar: [],
      } },
    })
    renderAt('/insights', <Route path="/insights" element={<InsightsPage />} />)
    const tiles = await screen.findByLabelText('Average per day')
    await vi.waitFor(() => expect(within(tiles).getByTestId('macro-fiber')).toHaveTextContent('27 g')) // (4 × 24 + 3 × 32) / 7
    expect(within(tiles).getByTestId('macro-sugar')).toHaveTextContent('30 g')
    expect(screen.getByLabelText('Meals eaten')).toHaveTextContent('5breakfasts6lunches7dinners3snacks')

    expect(fetch.mock.calls.some(([u]) => String(u).startsWith('/api/insights/sources'))).toBe(false) // only when opened
    fireEvent.click(screen.getByRole('button', { name: /Where it comes from/ }))
    const list = await screen.findByLabelText('Where it comes from')
    expect(await within(list).findByText('Chicken breast')).toBeInTheDocument()
    expect(within(list).getByText('3× · 450 g')).toBeInTheDocument()
    expect(fetch).toHaveBeenCalledWith('/api/insights/sources?end=2026-10-04&days=7&user_id=1', expect.anything())
    fireEvent.click(within(list).getByRole('button', { name: 'Fiber' }))
    expect(within(list).getByText('Chia seeds')).toBeInTheDocument()
    fireEvent.click(within(list).getByRole('button', { name: 'Fat' }))
    expect(within(list).getByText('Nothing logged with fat yet.')).toBeInTheDocument()
  })

  it('counts eating out and bought food for the range', async () => {
    api({ '/api/insights': { members: [memberInsights({ not_cooked: { out: 2, bought: 1, spent: 31.5 } })] } })
    renderAt('/insights', <Route path="/insights" element={<InsightsPage />} />)
    const card = await screen.findByLabelText('Eating out')
    expect(card).toHaveTextContent('Ate out 2× · bought 1×')
    expect(card).toHaveTextContent('31.50 € paid this week')
  })

  it('says so when everything was cooked at home', async () => {
    api()
    renderAt('/insights', <Route path="/insights" element={<InsightsPage />} />)
    expect(await screen.findByLabelText('Eating out')).toHaveTextContent('Everything home-cooked this week')
  })

  it('overview month range loads the last 30 days', async () => {
    const month = memberInsights({
      days: Array.from({ length: 30 }, (_, i) => ({ ...memberInsights().days[0], date: todayISO(new Date(2026, 8, 5 + i)), fiber: i < 10 ? 31 : 5 })),
    })
    const fetch = api()
    renderAt('/insights', <Route path="/insights" element={<InsightsPage />} />)
    await screen.findByText('3 of 7 days hit · avg 27 g')
    fetch.mockImplementation((url) => Promise.resolve(String(url).includes('days=30') ? jsonResponse({ members: [month] }) : jsonResponse({ members: [memberInsights()] })))
    fireEvent.click(screen.getByRole('button', { name: 'Month' }))
    expect(await screen.findByText('10 of 30 days hit · avg 14 g')).toBeInTheDocument()
    expect(fetch).toHaveBeenCalledWith('/api/insights?end=2026-10-04&days=30', expect.anything())
    expect(screen.getByRole('table', { name: 'Calories per day' }).querySelectorAll('tr')).toHaveLength(30)
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

  it('calendar colors the days each goal was hit and steps through months', async () => {
    const fetch = api()
    renderAt('/insights?tab=calendar', <Route path="/insights" element={<InsightsPage />} />)
    const grid = await screen.findByRole('grid', { name: 'kcal goal, October 2026' })
    expect(fetch).toHaveBeenCalledWith('/api/insights?end=2026-10-04&days=92', expect.anything())
    // fixture: kcal 2000 + i·50 over Sep 28 – Oct 4 (Oct: 2150–2300, all within ±150), fiber 32 on odd days
    expect(await within(grid).findByRole('button', { name: '2026-10-04: goal hit' })).toBeInTheDocument()
    expect(within(grid).getByRole('button', { name: '2026-10-05: upcoming' })).toBeDisabled()
    expect(screen.getByText('Within ±150 kcal of 2200 · 4 of 4 logged days')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Fiber' }))
    expect(within(grid).getByRole('button', { name: '2026-10-04: missed' })).toBeInTheDocument()
    expect(within(grid).getByRole('button', { name: '2026-10-03: goal hit' })).toBeInTheDocument()
    expect(screen.getByLabelText('Current streak')).toHaveTextContent('1 day')
    fireEvent.click(within(grid).getByRole('button', { name: '2026-10-03: goal hit' }))
    expect(screen.getByText('Sat, Oct 3: 32 g fiber · goal hit')).toBeInTheDocument()

    expect(screen.getByRole('button', { name: 'Next month' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    expect(await screen.findByRole('grid', { name: 'Fiber goal, September 2026' })).toBeInTheDocument()
    expect(fetch).toHaveBeenCalledWith('/api/insights?end=2026-09-30&days=92', expect.anything())
    expect(screen.queryByLabelText('Current streak')).not.toBeInTheDocument()
  })

  it('asks to invite the partner when alone', async () => {
    api({ '/api/insights': { members: [memberInsights()] } })
    renderAt('/insights', <Route path="/insights" element={<InsightsPage />} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Versus' }))
    expect(await screen.findByText(/Versus starts once your partner joins/)).toBeInTheDocument()
  })
})
