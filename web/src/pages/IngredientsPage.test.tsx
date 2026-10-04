import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { Route } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import { tokenStore } from '../api/client'
import type { StockItem } from '../api/types'
import { expiryText } from '../lib/stock'
import { card, ING } from '../test/fixtures'
import { jsonResponse, mockFetch, renderAt } from '../test/utils'
import { IngredientsPage } from './IngredientsPage'

const stock: StockItem[] = [
  { ingredient: ING.chicken, grams: 100, expires_on: '2026-10-05', days_left: 1 },
  { ingredient: ING.rice, grams: 500, expires_on: '2026-12-03', days_left: 60 },
]

function api(items: StockItem[] = stock) {
  return mockFetch((url, init) => {
    if (url === '/api/inventory/cookable') return jsonResponse([card({ id: 7, name: 'Chicken rice bowl' })])
    if (url.startsWith('/api/inventory') && init?.method === 'DELETE') return new Response(null, { status: 204 })
    if (url.startsWith('/api/inventory') && init?.method) return jsonResponse({ ...stock[0], ingredient: ING.soy })
    if (url.startsWith('/api/ingredients')) return jsonResponse([ING.soy])
    return jsonResponse(items)
  })
}

beforeEach(() => tokenStore.set('tok'))
const render = () => renderAt('/ingredients', <Route path="/ingredients" element={<IngredientsPage />} />)

describe('expiryText', () => {
  it('uses the mock wording', () => {
    expect(expiryText(1)).toBe('expires today/tomorrow')
    expect(expiryText(5)).toBe('5 days left')
    expect(expiryText(90)).toBe('3 months left')
    expect(expiryText(-2)).toBe('expired')
  })
})

describe('IngredientsPage', () => {
  it('splits fridge and pantry, shows expiry and suggestions', async () => {
    api()
    render()
    expect(await screen.findByText('Chicken breast')).toBeInTheDocument()
    expect(screen.getByText('expires today/tomorrow')).toHaveClass('exp-1')
    expect(screen.getByRole('button', { name: 'Fridge' })).toHaveTextContent('Fridge 1')
    expect(await screen.findByRole('link', { name: /Chicken rice bowl/ })).toHaveAttribute('href', '/meals/7')
    expect(screen.queryByText('Rice (cooked)')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Pantry' }))
    expect(screen.getByText('Rice (cooked)')).toBeInTheDocument()
    expect(screen.getByText('2 months left')).toBeInTheDocument()
  })

  it('steps amounts by 50 g', async () => {
    const fetch = api()
    render()
    fireEvent.click(await screen.findByLabelText('More Chicken breast'))
    await waitFor(() => expect(fetch.mock.calls.some(([, i]) => i?.method === 'PATCH')).toBe(true))
    const [url, init] = fetch.mock.calls.find(([, i]) => i?.method === 'PATCH')!
    expect(String(url)).toMatch(/^\/api\/inventory\/1\?today=\d{4}-\d{2}-\d{2}$/)
    expect(JSON.parse(String(init!.body))).toEqual({ delta: 50 })
  })

  it('asks before removing the last 50 g and puts it on the shopping list', async () => {
    const fetch = api([{ ...stock[0], grams: 50 }])
    render()
    fireEvent.click(await screen.findByLabelText('Less Chicken breast'))
    expect(fetch.mock.calls.some(([, i]) => i?.method === 'PATCH')).toBe(false)
    const sheet = await screen.findByRole('dialog', { name: 'Remove ingredient' })
    fireEvent.click(within(sheet).getByText('Yes, used it up — add to shopping list'))
    expect(await screen.findByText('Chicken breast removed · added to shopping list')).toBeInTheDocument()
    expect(fetch.mock.calls.some(([u, i]) => u === '/api/inventory/1?used_up=true' && i?.method === 'DELETE')).toBe(true)
  })

  it('"Keep it" closes the sheet without changes', async () => {
    const fetch = api([{ ...stock[0], grams: 50 }])
    render()
    fireEvent.click(await screen.findByLabelText('Less Chicken breast'))
    fireEvent.click(within(await screen.findByRole('dialog')).getByText('Keep it'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(fetch.mock.calls.some(([, i]) => i?.method === 'DELETE')).toBe(false)
  })

  it('adds an ingredient from the picker', async () => {
    const fetch = api()
    render()
    fireEvent.click(await screen.findByRole('button', { name: 'Add ingredient' }))
    fireEvent.click(await within(screen.getByRole('dialog')).findByText('Soy sauce'))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    const post = fetch.mock.calls.find(([u, i]) => u === '/api/inventory' && i?.method === 'POST')!
    expect(JSON.parse(String(post[1]!.body))).toMatchObject({ ingredient_id: 4 })
    expect(screen.getByRole('button', { name: 'Pantry' })).toHaveAttribute('aria-pressed', 'true')
  })
})
