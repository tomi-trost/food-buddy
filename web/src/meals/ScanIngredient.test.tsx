import { fireEvent, screen, within } from '@testing-library/react'
import { Route } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { tokenStore } from '../api/client'
import type { Ingredient, Product } from '../api/types'
import { ING } from '../test/fixtures'
import { jsonResponse, mockFetch, renderAt } from '../test/utils'
import { IngredientPicker } from '../ui/IngredientPicker'

vi.mock('../lib/barcodeReader', () => ({ readBarcode: vi.fn() }))

const CODE = '3838989562224'
const per100 = { kcal: 310, protein: 8.5, carbs: 52, fat: 7, fiber: 3, sugar: 2.5 }
const product = (over: Partial<Product> = {}): Product => ({
  code: CODE, name: 'Tortilla wraps', brand: 'Mlinotest, Ajdovščina', quantity: '6 × 62 g', per: '100g', serving_g: 62, piece_g: null,
  image_url: null, per100, kind: 'savory', remembered: false, meal_id: null, source: 'Open Food Facts', ingredient: null, ...over,
})
const tortilla: Ingredient = { ...ING.rice, id: 77, name: 'Tortilla wraps (Mlinotest)', per100, unit: 'pc', unit_grams: 62 }

function setup(lookup: () => Response) {
  const fetch = mockFetch((url, init) => {
    if (url === `/api/barcode/${CODE}`) return lookup()
    if (url === `/api/barcode/${CODE}/ingredient` && init?.method === 'POST') return jsonResponse(tortilla)
    return jsonResponse([ING.soy])
  })
  const onPick = vi.fn()
  renderAt('/', <Route path="/" element={<IngredientPicker onPick={onPick} />} />)
  fireEvent.click(screen.getByRole('button', { name: 'Scan a barcode' }))
  fireEvent.change(screen.getByLabelText('Barcode number'), { target: { value: CODE } })
  fireEvent.click(screen.getByRole('button', { name: 'Look up' }))
  const posted = () => fetch.mock.calls.find(([u, i]) => u === `/api/barcode/${CODE}/ingredient` && i?.method === 'POST')
  return { fetch, onPick, posted }
}

beforeEach(() => {
  tokenStore.set('tok')
  Reflect.deleteProperty(navigator, 'mediaDevices') // no camera: type the number
})

describe('scanning an ingredient', () => {
  it('adds one of ours straight away', async () => {
    const { onPick, posted } = setup(() => jsonResponse(product({ ingredient: tortilla })))
    await vi.waitFor(() => expect(onPick).toHaveBeenCalledWith(tortilla))
    expect(posted()).toBeUndefined()
  })

  it('checks a new pack once, counted in pieces, and makes it our ingredient', async () => {
    const { onPick, posted } = setup(() => jsonResponse(product()))
    const form = await screen.findByLabelText('New ingredient from the pack')
    expect(within(form).getByLabelText('Name')).toHaveValue('Tortilla wraps (Mlinotest)')
    expect(within(form).getByTestId('macro-kcal')).toHaveTextContent('310')
    fireEvent.click(within(form).getByRole('button', { name: 'Pieces' }))
    expect(within(form).getByRole('textbox', { name: 'piece weight' })).toHaveValue('62') // the serving
    fireEvent.click(within(form).getByRole('button', { name: 'Add Tortilla wraps (Mlinotest)' }))
    await vi.waitFor(() => expect(onPick).toHaveBeenCalledWith(tortilla))
    expect(JSON.parse(String(posted()![1]!.body))).toEqual({ name: 'Tortilla wraps (Mlinotest)', per: '100g', per100, piece_g: 62 })
  })

  it('types the values when Open Food Facts does not know the pack', async () => {
    const { onPick, posted } = setup(() => jsonResponse({ detail: 'Product not found in Open Food Facts' }, 404))
    fireEvent.click(await screen.findByRole('button', { name: /Type the values from the pack/ }))
    const form = screen.getByLabelText('New ingredient from the pack')
    const add = () => within(form).getByRole('button', { name: /^Add/ })
    expect(add()).toBeDisabled() // no name, no values yet
    fireEvent.change(within(form).getByLabelText('Name'), { target: { value: 'Market wraps' } })
    for (const [k, v] of [['kcal', '300'], ['protein (g)', '9'], ['carbs (g)', '50'], ['fat (g)', '6'], ['fiber (g)', '2'], ['sugar (g)', '3']]) {
      fireEvent.change(within(form).getByLabelText(k), { target: { value: v } })
    }
    fireEvent.click(add())
    await vi.waitFor(() => expect(onPick).toHaveBeenCalled())
    expect(JSON.parse(String(posted()![1]!.body))).toMatchObject({ name: 'Market wraps', piece_g: null, per100: { kcal: 300, sugar: 3 } })
  })

  it('goes back to the search', async () => {
    setup(() => jsonResponse({ detail: "Open Food Facts can't be reached right now" }, 503))
    expect(await screen.findByText("Open Food Facts can't be reached right now")).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Search instead/ }))
    expect(screen.getByLabelText('Search ingredients')).toBeInTheDocument()
  })
})
