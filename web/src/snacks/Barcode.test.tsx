import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { Route } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAddFood } from '../add/AddFood'
import { tokenStore } from '../api/client'
import type { Product } from '../api/types'
import { readBarcode } from '../lib/barcodeReader'
import { jsonResponse, mockFetch, renderAt } from '../test/utils'

vi.mock('../lib/barcodeReader', () => ({ readBarcode: vi.fn() }))

const CODE = '8000500310427'
const per100 = { kcal: 539, protein: 6.3, carbs: 57.5, fat: 30.9, fiber: 0, sugar: 56.3 }
const nutella: Product = {
  code: CODE, name: 'Nutella', brand: 'Ferrero', quantity: '400 g', serving_g: 15,
  image_url: null, per100, kind: 'sweet', remembered: false, source: 'Open Food Facts',
}

function Opener() {
  const open = useAddFood()
  return <button onClick={() => open()}>open</button>
}

function setup(product: Product | null | 'down' = nutella) {
  const fetch = mockFetch((url) => {
    if (url.startsWith('/api/barcode/')) {
      if (product === 'down') return jsonResponse({ detail: "Open Food Facts can't be reached right now" }, 503)
      return product ? jsonResponse(product) : jsonResponse({ detail: 'Product not found in Open Food Facts' }, 404)
    }
    if (url === '/api/snacks') return jsonResponse({ id: 1, name: 'Ferrero Nutella', kcal: 80.8, sugar: 8.4, treat: true, saved_id: 3 }, 201)
    if (url === '/api/analyses') return jsonResponse({ id: 9, status: 'queued' }, 202)
    if (url === '/api/snacks/saved' || url === '/api/snacks/catalog') return jsonResponse([])
    return jsonResponse({})
  })
  renderAt('/', <Route path="/" element={<Opener />} />)
  fireEvent.click(screen.getByRole('button', { name: 'open' }))
  fireEvent.click(within(screen.getByRole('dialog', { name: 'Add food' })).getByRole('button', { name: /Scan a barcode/ }))
  return { fetch, sheet: screen.getByRole('dialog', { name: 'Log a snack' }) }
}

const typeCode = (sheet: HTMLElement, code: string) => {
  fireEvent.change(within(sheet).getByLabelText('Barcode number'), { target: { value: code } })
  fireEvent.click(within(sheet).getByRole('button', { name: 'Look up' }))
}
const lookups = (fetch: ReturnType<typeof mockFetch>) => fetch.mock.calls.filter(([u]) => String(u).startsWith('/api/barcode/'))

beforeEach(() => {
  tokenStore.set('tok')
  vi.mocked(readBarcode).mockReset()
})
afterEach(() => {
  Reflect.deleteProperty(navigator, 'mediaDevices')
})

describe('Barcode scanner', () => {
  it('opens from Add food on the scanner, without a live camera offers photo and typing', () => {
    const { sheet } = setup()
    expect(within(sheet).getByRole('heading', { name: 'Scan a barcode' })).toBeInTheDocument()
    expect(within(sheet).getByText(/No live camera here/)).toBeInTheDocument()
    expect(within(sheet).getByLabelText('Photo of the barcode')).toHaveAttribute('capture', 'environment')
  })

  it('looks up a typed number and logs the product per 100 g, one serving, saved to our snacks', async () => {
    const { fetch, sheet } = setup()
    typeCode(sheet, '8000500 310427')
    expect(await within(sheet).findByDisplayValue('Ferrero Nutella')).toBeInTheDocument()
    expect(lookups(fetch)[0][0]).toBe(`/api/barcode/${CODE}`)
    expect(within(sheet).getByText('From Open Food Facts · 400 g pack. Check them against the label, we remember your changes.')).toBeInTheDocument()
    expect(within(sheet).getByRole('button', { name: 'Sweet' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(sheet).getByText('15 g')).toBeInTheDocument()

    fireEvent.click(within(sheet).getByRole('switch'))
    fireEvent.click(within(sheet).getByRole('button', { name: 'Log snack' }))
    await screen.findByText(/Ferrero Nutella logged/)
    const [, init] = fetch.mock.calls.find(([u]) => u === '/api/snacks')!
    expect(JSON.parse(String(init!.body))).toMatchObject({
      name: 'Ferrero Nutella', emoji: '🍪', kind: 'sweet', source: 'barcode', per: '100g', amount: 15, per_unit: per100, save: true,
      barcode: CODE,
    })
  })

  it('lets you change the guessed type (water is no treat) and scan another', async () => {
    const { fetch, sheet } = setup({ ...nutella, name: 'Still water', brand: 'Aqua', kind: 'drink', per100: { ...per100, kcal: 0, sugar: 0 } })
    typeCode(sheet, CODE)
    await within(sheet).findByDisplayValue('Aqua Still water')
    expect(within(sheet).getByRole('button', { name: 'Drink' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(within(sheet).getByRole('button', { name: 'Savory' }))
    fireEvent.click(within(sheet).getByRole('button', { name: 'Log snack' }))
    await waitFor(() => expect(fetch.mock.calls.some(([u]) => u === '/api/snacks')).toBe(true))
    const [, init] = fetch.mock.calls.find(([u]) => u === '/api/snacks')!
    expect(JSON.parse(String(init!.body))).toMatchObject({ kind: 'savory', emoji: '🥨', save: false })
  })

  it('shows the treat hint only for sweets and drinks', async () => {
    const { sheet } = setup({ ...nutella, name: 'Dried apricots', brand: '', kind: 'fruit' })
    typeCode(sheet, CODE)
    await within(sheet).findByDisplayValue('Dried apricots')
    expect(within(sheet).getByRole('button', { name: 'Fruit' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(sheet).queryByText('Counts as a treat for your streak')).not.toBeInTheDocument()
    fireEvent.click(within(sheet).getByRole('button', { name: 'Sweet' }))
    expect(within(sheet).getByText('Counts as a treat for your streak')).toBeInTheDocument()
  })

  it('goes back to the scanner with "Scan another"', async () => {
    const { sheet } = setup()
    typeCode(sheet, CODE)
    fireEvent.click(await within(sheet).findByRole('button', { name: 'Scan another' }))
    expect(within(sheet).getByRole('heading', { name: 'Scan a barcode' })).toBeInTheDocument()
  })

  it('rejects a typed number that is not a barcode without asking the server', () => {
    const { fetch, sheet } = setup()
    typeCode(sheet, '12345')
    expect(within(sheet).getByRole('alert')).toHaveTextContent('A barcode number has 8 to 14 digits.')
    expect(lookups(fetch)).toHaveLength(0)
  })

  it('reads the code from a photo of the barcode', async () => {
    vi.mocked(readBarcode).mockResolvedValue(CODE)
    const { fetch, sheet } = setup()
    const file = new File(['x'], 'b.jpg', { type: 'image/jpeg' })
    fireEvent.change(within(sheet).getByLabelText('Photo of the barcode'), { target: { files: [file] } })
    await within(sheet).findByDisplayValue('Ferrero Nutella')
    expect(readBarcode).toHaveBeenCalledWith(file)
    expect(lookups(fetch)).toHaveLength(1)
  })

  it('says so when the photo has no readable barcode', async () => {
    vi.mocked(readBarcode).mockResolvedValue(null)
    const { fetch, sheet } = setup()
    fireEvent.change(within(sheet).getByLabelText('Photo of the barcode'), { target: { files: [new File(['x'], 'b.jpg')] } })
    expect(await within(sheet).findByRole('alert')).toHaveTextContent('No barcode found in this photo')
    expect(lookups(fetch)).toHaveLength(0)
  })

  it('offers the nutrition label when Open Food Facts does not know the product', async () => {
    const { fetch, sheet } = setup(null)
    typeCode(sheet, CODE)
    expect(await within(sheet).findByText('Not in Open Food Facts yet.')).toBeInTheDocument()
    fireEvent.change(within(sheet).getByLabelText('Scan the label instead'), { target: { files: [new File(['x'], 'l.jpg')] } })
    expect(await screen.findByText('Reading the label… it shows up above the tabs when ready')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    const upload = fetch.mock.calls.find(([u]) => u === '/api/analyses')!
    expect((upload[1]!.body as FormData).get('kind')).toBe('label')
  })

  it('uses our remembered values, and a corrected name is sent along', async () => {
    const { fetch, sheet } = setup({ ...nutella, name: 'Nutella (ours)', brand: '', serving_g: 20, remembered: true, source: 'Our values' })
    typeCode(sheet, CODE)
    const name = await within(sheet).findByDisplayValue('Nutella (ours)')
    expect(within(sheet).getByText('Your values from last time. Change them if this one was different.')).toBeInTheDocument()
    expect(within(sheet).getByText('20 g')).toBeInTheDocument()

    fireEvent.change(name, { target: { value: '' } })
    expect(within(sheet).getByRole('button', { name: 'Log snack' })).toBeDisabled() // a name is needed
    fireEvent.change(name, { target: { value: 'Nutella jar' } })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Log snack' }))
    await waitFor(() => expect(fetch.mock.calls.some(([u]) => u === '/api/snacks')).toBe(true))
    const [, init] = fetch.mock.calls.find(([u]) => u === '/api/snacks')!
    expect(JSON.parse(String(init!.body))).toMatchObject({ name: 'Nutella jar', amount: 20, barcode: CODE })
  })

  it('lets you type in a product Open Food Facts does not know, remembered by its barcode', async () => {
    const { fetch, sheet } = setup(null)
    typeCode(sheet, CODE)
    fireEvent.click(await within(sheet).findByRole('button', { name: /Type the values from the pack/ }))
    const log = within(sheet).getByRole('button', { name: 'Log snack' })
    expect(log).toBeDisabled()
    fireEvent.change(within(sheet).getByLabelText('Product name'), { target: { value: 'Market granola' } })
    fireEvent.change(within(sheet).getByLabelText('kcal'), { target: { value: '450' } })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Sweet' }))
    fireEvent.click(log)
    await waitFor(() => expect(fetch.mock.calls.some(([u]) => u === '/api/snacks')).toBe(true))
    const [, init] = fetch.mock.calls.find(([u]) => u === '/api/snacks')!
    expect(JSON.parse(String(init!.body))).toMatchObject({
      name: 'Market granola', kind: 'sweet', source: 'barcode', per: '100g', amount: 100, barcode: CODE,
      per_unit: { kcal: 450, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0 },
    })
  })

  it('shows the server message when Open Food Facts is down', async () => {
    const { sheet } = setup('down')
    typeCode(sheet, CODE)
    expect(await within(sheet).findByText("Open Food Facts can't be reached right now")).toBeInTheDocument()
    expect(within(sheet).queryByLabelText('Scan the label instead')).not.toBeInTheDocument()
    expect(within(sheet).queryByRole('button', { name: /Type the values/ })).not.toBeInTheDocument()
  })

  it('asks for the values when Open Food Facts has none, logging only after they are typed', async () => {
    const { sheet } = setup({ ...nutella, per100: null })
    typeCode(sheet, CODE)
    expect(await within(sheet).findByText('Open Food Facts has no values for this one. Type them from the label, we remember them.')).toBeInTheDocument()
    const log = within(sheet).getByRole('button', { name: 'Log snack' })
    expect(log).toBeDisabled()
    fireEvent.change(within(sheet).getByLabelText('kcal'), { target: { value: '539' } })
    expect(log).toBeEnabled()
  })
})

describe('live camera', () => {
  const fakeCamera = (getUserMedia: () => Promise<MediaStream>) =>
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn(getUserMedia) } })

  it('shows the camera and stops it when the sheet closes', async () => {
    const stop = vi.fn()
    fakeCamera(() => Promise.resolve({ getTracks: () => [{ stop }] } as unknown as MediaStream))
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
    const { sheet } = setup()
    expect(within(sheet).getByLabelText('Camera')).toBeInTheDocument()
    expect(await within(sheet).findByText('Hold the barcode inside the frame')).toBeInTheDocument()
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith(expect.objectContaining({ audio: false }))

    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(stop).toHaveBeenCalled()
  })

  it('falls back to photo and typing when camera access is denied', async () => {
    fakeCamera(() => Promise.reject(new DOMException('denied', 'NotAllowedError')))
    const { sheet } = setup()
    expect(await within(sheet).findByText(/No live camera here/)).toBeInTheDocument()
    expect(within(sheet).queryByLabelText('Camera')).not.toBeInTheDocument()
  })
})
