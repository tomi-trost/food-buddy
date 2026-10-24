import { fireEvent, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { Route } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { tokenStore } from '../api/client'
import { ING } from '../test/fixtures'
import { jsonResponse, mockFetch, renderAt } from '../test/utils'
import { IngredientChips } from './IngredientChips'
import type { PlateItem } from './plate'

function Harness() {
  const [items, setItems] = useState<PlateItem[]>([
    { key: 'a', name: 'boiled eggs', grams: 100, ingredient: ING.eggs },
    { key: 'b', name: 'olive oil', grams: 9.1, ingredient: ING.oil },
  ])
  return <><IngredientChips items={items} setItems={setItems} /><output>{items.map((i) => i.grams).join(',')}</output></>
}

const render = () => renderAt('/', <Route path="/" element={<Harness />} />)

beforeEach(() => tokenStore.set('tok'))

describe('IngredientChips units', () => {
  it('counts eggs in pieces and oil in ml, storing grams', () => {
    mockFetch(() => jsonResponse([]))
    render()
    fireEvent.click(screen.getByRole('button', { name: /Eggs · 2 pcs/ }))
    const sheet = screen.getByRole('dialog', { name: 'Edit ingredient' })
    expect(within(sheet).getByText(/≈ 100 g/)).toBeInTheDocument()
    expect(within(sheet).getByText(/1 pc ≈ 50 g/)).toBeInTheDocument()
    fireEvent.click(within(sheet).getByLabelText('More amount'))
    expect(screen.getByRole('status')).toHaveTextContent('150,9.1') // 3 eggs
    const field = within(sheet).getByRole('textbox', { name: 'amount' })
    fireEvent.focus(field)
    fireEvent.change(field, { target: { value: '1' } })
    fireEvent.blur(field)
    expect(screen.getByRole('status')).toHaveTextContent('50,9.1')
    fireEvent.click(within(sheet).getByRole('button', { name: 'Done' }))

    fireEvent.click(screen.getByRole('button', { name: /Olive oil · 10 ml/ }))
    const oil = within(screen.getByRole('dialog', { name: 'Edit ingredient' })).getByRole('textbox', { name: 'amount' })
    fireEvent.focus(oil)
    fireEvent.change(oil, { target: { value: '15' } })
    fireEvent.blur(oil)
    expect(screen.getByRole('status')).toHaveTextContent('50,13.7') // 15 ml × 0.91
  })

  it('switches how an ingredient is counted, asking a piece weight once', async () => {
    const fetch = mockFetch((url, init) => {
      if (url === '/api/ingredients/5/unit' && init?.method === 'PUT') {
        const { unit, unit_grams } = JSON.parse(String(init.body))
        return jsonResponse({ ...ING.oil, unit, unit_grams })
      }
      return jsonResponse([])
    })
    render()
    fireEvent.click(screen.getByRole('button', { name: /Olive oil · 10 ml/ }))
    const sheet = screen.getByRole('dialog', { name: 'Edit ingredient' })
    const count = within(sheet).getByRole('group', { name: 'Count in' })
    expect(within(count).getByRole('button', { name: 'ml' })).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(within(count).getByRole('button', { name: 'Grams' }))
    expect(await screen.findByRole('button', { name: /Olive oil · 9 g/ })).toBeInTheDocument() // the chip follows
    expect(screen.getByRole('status')).toHaveTextContent('100,9.1') // grams stay as they were

    fireEvent.click(within(count).getByRole('button', { name: 'Pieces' }))
    const ask = within(sheet).getByLabelText('Weight of one piece')
    const weight = within(ask).getByRole('textbox', { name: 'piece weight' })
    fireEvent.focus(weight)
    fireEvent.change(weight, { target: { value: '4.5' } })
    fireEvent.blur(weight)
    fireEvent.click(within(ask).getByRole('button', { name: 'Count in pieces' }))
    expect(await screen.findByRole('button', { name: /Olive oil · 2 pcs/ })).toBeInTheDocument() // 9.1 g ÷ 4.5
    const puts = fetch.mock.calls.filter(([, i]) => i?.method === 'PUT').map(([, i]) => JSON.parse(String(i!.body)))
    expect(puts).toEqual([{ unit: 'g', unit_grams: 1 }, { unit: 'pc', unit_grams: 4.5 }])
  })

  it('shows an error when the unit cannot be saved', async () => {
    mockFetch((_url, init) => (init?.method === 'PUT' ? jsonResponse({ detail: 'Ingredient not found' }, 404) : jsonResponse([])))
    render()
    fireEvent.click(screen.getByRole('button', { name: /Eggs · 2 pcs/ }))
    fireEvent.click(within(screen.getByRole('group', { name: 'Count in' })).getByRole('button', { name: 'Grams' }))
    expect(await screen.findByText('Ingredient not found')).toBeInTheDocument()
    await vi.waitFor(() => expect(screen.getByRole('button', { name: /Eggs · 2 pcs/ })).toBeInTheDocument())
  })
})
