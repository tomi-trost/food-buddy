import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { Route } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { tokenStore } from '../api/client'
import type { Plan, Shopping } from '../api/types'
import { card, me, meal, plan, shopping } from '../test/fixtures'
import { jsonResponse, mockFetch, renderAt } from '../test/utils'
import { AddToPlanSheet } from '../meals/AddToPlanSheet'
import { EditMealSheet } from '../meals/EditMealSheet'
import { PlanPage } from './PlanPage'

type Handler = (url: string, init?: RequestInit) => Response | undefined

function api(state: { plan: Plan | null; shopping?: Shopping }, extra: Handler = () => undefined) {
  return mockFetch((url, init) => {
    const hit = extra(url, init)
    if (hit) return hit
    if (url === '/api/auth/me') return jsonResponse(me())
    if (url === '/api/plan') return jsonResponse(state.plan)
    if (url === '/api/shopping') return jsonResponse(state.shopping ?? shopping({ items: [], plan_approved: false, in_stock: [] }))
    if (url.endsWith('/options')) return jsonResponse([card({ id: 3, name: 'Chicken stir-fry', score: 4.8 }), card({ id: 9, name: 'Curry', score: null })])
    return jsonResponse({})
  })
}

const routes = (
  <>
    <Route path="/plan" element={<PlanPage />} />
    <Route path="/ingredients" element={<p>ingredients page</p>} />
  </>
)

beforeEach(() => {
  tokenStore.set('tok')
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 4, 12)) // Sunday 4 Oct 2026
})

describe('PlanPage menu', () => {
  it('generates a menu from the wizard for next week', async () => {
    const fetch = api({ plan: null }, (url, init) => (url === '/api/plan' && init?.method === 'POST' ? jsonResponse(plan(), 201) : undefined))
    renderAt('/plan', routes)
    fireEvent.click(await screen.findByRole('button', { name: 'Plan the week' }))
    const sheet = screen.getByRole('dialog', { name: 'Plan the week' })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Mon breakfast: 15m' })) // → 30m
    fireEvent.click(within(sheet).getByRole('button', { name: 'Generate menu' }))
    expect(await screen.findByText('Batch cook:', { exact: false })).toBeInTheDocument()
    const [, init] = fetch.mock.calls.find(([u, i]) => u === '/api/plan' && i?.method === 'POST')!
    const body = JSON.parse(String(init!.body))
    expect(body.week_start).toBe('2026-10-05')
    expect(body.wizard[0][0]).toEqual({ mode: 'cook', minutes: 30 })
    expect(body.wizard[4][2]).toEqual({ mode: 'out', minutes: null }) // mock default: Friday out
  })

  it('shows the week with summary, slots and approvals', async () => {
    api({ plan: plan() })
    renderAt('/plan', routes)
    expect(await screen.findByLabelText('Week summary')).toHaveTextContent('13Cook')
    expect(screen.getByLabelText('Week summary')).toHaveTextContent('42.50groceries')
    expect(screen.getByText('Chicken rice bowl', { selector: 'b' })).toBeInTheDocument()
    expect(screen.getByText('Mon 5')).toBeInTheDocument()
    expect(screen.getAllByText('Eating out')).toHaveLength(1)
    expect(screen.getAllByText(/Cook · 25 of 30 min/).length).toBeGreaterThan(0)
    expect(screen.getByText('Pending')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Approve as Tomi' })).toBeEnabled()
  })

  it('changes a slot mode and picks a meal', async () => {
    const fetch = api({ plan: plan() }, (_url, init) => (init?.method === 'PUT' ? jsonResponse(plan()) : undefined))
    renderAt('/plan', routes)
    fireEvent.click((await screen.findAllByRole('button', { name: /Dinner Chicken stir-fry/ }))[0])
    const sheet = screen.getByRole('dialog', { name: 'Edit slot' })
    expect(within(sheet).getByRole('heading')).toHaveTextContent('Mon · Dinner')
    fireEvent.click(await within(sheet).findByRole('button', { name: /Curry/ }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    const [slotUrl, init] = fetch.mock.calls.find(([, i]) => i?.method === 'PUT')!
    expect(slotUrl).toBe('/api/plan/slots/0/dinner')
    expect(JSON.parse(String(init!.body))).toEqual({ mode: 'cook', meal_id: 9 })
  })

  it('approving as the last person opens the shopping list', async () => {
    const state = { plan: plan() as Plan | null, shopping: shopping() }
    api(state, (url) => (url === '/api/plan/approve' ? jsonResponse(plan({ status: 'approved' })) : undefined))
    renderAt('/plan', routes)
    fireEvent.click(await screen.findByRole('button', { name: 'Approve as Tomi' }))
    expect(await screen.findByText('Menu approved — shopping list ready')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Shopping list' })).toHaveAttribute('aria-pressed', 'true'))
  })
})

describe('Shopping list', () => {
  it('explains when there is nothing yet', async () => {
    api({ plan: null })
    renderAt('/plan?tab=shop', routes)
    expect(await screen.findByText(/appears once you both approve the weekly menu/)).toBeInTheDocument()
  })

  it('groups items, checks them off and finishes shopping', async () => {
    const fetch = api({ plan: plan({ status: 'approved' }), shopping: shopping() }, (url, init) => {
      if (url.startsWith('/api/shopping/check/')) return jsonResponse(shopping())
      if (url === '/api/shopping/finish' && init?.method === 'POST') return jsonResponse({ added: 1 })
    })
    renderAt('/plan?tab=shop', routes)
    expect(await screen.findByText('3 items · est. 4.10 €')).toBeInTheDocument()
    expect(screen.getByText('1 in cart')).toBeInTheDocument()
    expect(screen.getByText('Ran out while cooking')).toBeInTheDocument()
    expect(screen.getByText('have 400 g')).toBeInTheDocument()
    expect(screen.getByText('Already in stock')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Rice (cooked), 600 g' }))
    await waitFor(() => expect(fetch.mock.calls.some(([u]) => u === '/api/shopping/check/2')).toBe(true))
    const [, check] = fetch.mock.calls.find(([u]) => u === '/api/shopping/check/2')!
    expect(JSON.parse(String(check!.body))).toEqual({ checked: true })

    fireEvent.click(screen.getByRole('button', { name: /Finished shopping/ }))
    expect(await screen.findByText('ingredients page')).toBeInTheDocument()
  })
})

describe('meal sheets', () => {
  it('adds a meal to a matching slot only', async () => {
    const fetch = api({ plan: plan() }, (_url, init) => (init?.method === 'PUT' ? jsonResponse(plan()) : undefined))
    renderAt('/m', <Route path="/m" element={<AddToPlanSheet meal={meal({ id: 3, types: ['dinner'] })} open onClose={() => {}} />} />)
    expect(await screen.findByRole('button', { name: 'Tue breakfast' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Tue dinner' }))
    await waitFor(() => expect(fetch.mock.calls.some(([, i]) => i?.method === 'PUT')).toBe(true))
    const [slotUrl, init] = fetch.mock.calls.find(([, i]) => i?.method === 'PUT')!
    expect(slotUrl).toBe('/api/plan/slots/1/dinner')
    expect(JSON.parse(String(init!.body))).toEqual({ mode: 'cook', meal_id: 3 })
  })

  it('edits meal types and the prep-friendly flag', async () => {
    const fetch = api({ plan: null }, (_u, init) => (init?.method === 'PATCH' ? jsonResponse(meal()) : undefined))
    renderAt('/m', <Route path="/m" element={<EditMealSheet meal={meal({ types: ['lunch'], tags: [] })} open onClose={() => {}} />} />)
    expect(screen.getByRole('button', { name: 'Lunch' })).toBeDisabled() // last type can't be removed
    fireEvent.click(screen.getByRole('button', { name: 'Dinner' }))
    fireEvent.click(screen.getByRole('button', { name: 'No' }))
    await waitFor(() => expect(fetch.mock.calls.filter(([, i]) => i?.method === 'PATCH')).toHaveLength(2))
    const bodies = fetch.mock.calls.filter(([, i]) => i?.method === 'PATCH').map(([, i]) => JSON.parse(String(i!.body)))
    expect(bodies).toEqual([{ types: ['lunch', 'dinner'] }, { prep_friendly: true }])
  })
})
