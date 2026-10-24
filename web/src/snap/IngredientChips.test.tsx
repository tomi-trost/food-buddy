import { fireEvent, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { Route } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { tokenStore } from '../api/client'
import { card, ING } from '../test/fixtures'
import { jsonResponse, mockFetch, renderAt } from '../test/utils'
import { IngredientChips } from './IngredientChips'
import { type PlateItem, toComponents } from './plate'

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

function BundleHarness({ start }: { start: PlateItem[] }) {
  const [items, setItems] = useState<PlateItem[]>(start)
  return (
    <>
      <IngredientChips items={items} setItems={setItems} dishes={{ platePortions: 1 }} />
      <output>{JSON.stringify(toComponents(items))}</output>
    </>
  )
}

describe('IngredientChips dishes', () => {
  const swapped: PlateItem[] = [
    { key: 'a', name: 'pancakes', grams: 100, ingredient: ING.banana },
    { key: 'b', name: 'oats', grams: 50, ingredient: ING.oats },
    { key: 'c', name: 'rice', grams: 200, ingredient: ING.rice },
  ]

  it('makes selected ingredients their own dish, named after what the photo saw', async () => {
    mockFetch((url) => jsonResponse(url.startsWith('/api/ingredients') ? [ING.banana] : []))
    const photo: PlateItem[] = [{ key: 'a', name: 'pancakes', grams: 100, ingredient: null }, ...swapped.slice(1)]
    renderAt('/', <Route path="/" element={<BundleHarness start={photo} />} />)
    fireEvent.click(screen.getByRole('button', { name: /pancakes · 100 g/ })) // the photo saw pancakes…
    fireEvent.click(await screen.findByRole('button', { name: /Banana/ })) // …made from banana, oats
    fireEvent.click(screen.getByRole('button', { name: /make them their own dish/ }))
    const make = screen.getByRole('button', { name: /Make it its own dish/ })
    expect(make).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: /Banana · 100 g/ }))
    fireEvent.click(screen.getByRole('button', { name: /Rolled oats · 50 g/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Make it its own dish (2)' }))

    const sheet = screen.getByRole('dialog', { name: 'Make it its own dish' })
    expect(within(sheet).getByLabelText('Dish name')).toHaveValue('Pancakes')
    fireEvent.click(within(sheet).getByLabelText('More dish portions made'))
    fireEvent.click(within(sheet).getByRole('button', { name: 'Make dish' }))

    expect(screen.getByRole('button', { name: /Pancakes · 1 portion/ })).toBeInTheDocument()
    expect(JSON.parse(screen.getByRole('status').textContent!)).toEqual([{
      new: { name: 'Pancakes', portions: 2, items: [{ ingredient_id: 23, grams: 100 }, { ingredient_id: 20, grams: 50 }] },
      portions: 1,
      aliases: ['pancakes'],
    }])

    // The dish: more portions on the plate, what's in it, back to separate ingredients
    fireEvent.click(screen.getByRole('button', { name: /Pancakes · 1 portion/ }))
    const dish = screen.getByRole('dialog', { name: 'Edit dish' })
    fireEvent.click(within(dish).getByLabelText('More dish portions'))
    expect(within(dish).getByText(/≈ 225 g/)).toBeInTheDocument()
    expect(within(dish).getByText('Rolled oats')).toBeInTheDocument()
    fireEvent.click(within(dish).getByRole('button', { name: /Back to separate ingredients/ }))
    expect(screen.getByRole('button', { name: /Banana · 150 g/ })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('[]')
  })

  it('cancels selecting without changing anything', () => {
    mockFetch(() => jsonResponse([]))
    renderAt('/', <Route path="/" element={<BundleHarness start={swapped} />} />)
    fireEvent.click(screen.getByRole('button', { name: /make them their own dish/ }))
    fireEvent.click(screen.getByRole('button', { name: /Banana · 100 g/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getAllByRole('button', { name: /·/ })).toHaveLength(3)
  })

  it('swaps an unknown item for one of our meals under "Ours"', async () => {
    mockFetch((url) => {
      if (url === '/api/meals') return jsonResponse([card({ id: 7, name: 'Banana pancakes', emoji: '🥞', portion_g: 300 }), card({ id: 8, name: 'Pancake plate', bundle: true })])
      return jsonResponse([ING.banana])
    })
    const unknown: PlateItem[] = [{ key: 'u', name: 'pancakes', grams: 180, ingredient: null }]
    renderAt('/', <Route path="/" element={<BundleHarness start={unknown} />} />)
    fireEvent.click(screen.getByRole('button', { name: /pancakes · 180 g/ }))
    const ours = await screen.findByLabelText('Our meals')
    expect(within(ours).queryByText('Pancake plate')).not.toBeInTheDocument() // holds dishes itself
    fireEvent.click(within(ours).getByRole('button', { name: /Banana pancakes/ }))
    expect(screen.getByRole('button', { name: /Banana pancakes · 1 portion/ })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('[{"meal_id":7,"portions":1,"aliases":["pancakes"]}]')
  })

  it('has no dish options without `dishes`', () => {
    mockFetch(() => jsonResponse([]))
    render()
    expect(screen.queryByRole('button', { name: /make them their own dish/ })).not.toBeInTheDocument()
  })
})
