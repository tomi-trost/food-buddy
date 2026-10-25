import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { Route } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { tokenStore } from '../api/client'
import { card, meal } from '../test/fixtures'
import { jsonResponse, mockFetch, renderAt } from '../test/utils'
import { dropOriginal, getOriginal, setSavePhotos } from '../lib/originals'
import { pending } from '../lib/outbox'
import { useAddFood } from './AddFood'

const photo = () => new File(['x'], 'p.jpg', { type: 'image/jpeg' })

function Opener({ opts }: { opts?: Parameters<ReturnType<typeof useAddFood>>[0] }) {
  const open = useAddFood()
  return <button onClick={() => open(opts)}>open</button>
}

function setup(opts?: Parameters<ReturnType<typeof useAddFood>>[0], handler: () => Response | Promise<Response> = () => jsonResponse({ id: 9, status: 'queued' }, 202)) {
  const fetch = mockFetch(handler)
  renderAt('/', (
    <>
      <Route path="/" element={<Opener opts={opts} />} />
      <Route path="/analysis/:id" element={<p>analysis page</p>} />
    </>
  ))
  fireEvent.click(screen.getByRole('button', { name: 'open' }))
  return { fetch, sheet: screen.getByRole('dialog', { name: 'Add food' }) }
}

const form = (fetch: ReturnType<typeof mockFetch>) => fetch.mock.calls[0][1]!.body as FormData

beforeEach(() => {
  tokenStore.set('tok')
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 4, 19)) // evening: dinner is the guess
})

describe('Add food sheet', () => {
  it('puts the camera first and guesses the meal from the time of day', () => {
    const { sheet } = setup()
    const camera = within(sheet).getByLabelText('Take photo')
    expect(camera).toHaveAttribute('capture', 'environment')
    expect(within(sheet).getByLabelText('Choose from library')).not.toHaveAttribute('capture')
    expect(document.querySelector(`label[for="${camera.id}"]`)).toHaveTextContent('Take a photo')
    expect(within(sheet).getByRole('button', { name: 'Dinner' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('uploads a meal photo with the chosen meal type and opens the check screen', async () => {
    const { fetch, sheet } = setup({ type: 'breakfast' })
    expect(within(sheet).getByRole('button', { name: 'Breakfast' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(within(sheet).getByRole('button', { name: 'Lunch' }))
    fireEvent.change(within(sheet).getByLabelText('Take photo'), { target: { files: [photo()] } })
    expect(await screen.findByText('analysis page')).toBeInTheDocument()
    expect(fetch.mock.calls[0][0]).toBe('/api/analyses')
    expect(form(fetch).get('kind')).toBe('meal')
    expect(form(fetch).get('meal_type')).toBe('lunch')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('keeps the camera original for Photos only when that is switched on', async () => {
    let { sheet } = setup()
    fireEvent.change(within(sheet).getByLabelText('Take photo'), { target: { files: [photo()] } })
    await screen.findByText('analysis page')
    expect(await getOriginal(9)).toBeNull() // off: nothing kept
    cleanup()

    setSavePhotos(true)
    ;({ sheet } = setup())
    fireEvent.change(within(sheet).getByLabelText('Choose from library'), { target: { files: [photo()] } })
    await screen.findByText('analysis page')
    expect(await getOriginal(9)).toBeNull() // already in Photos
    cleanup()

    ;({ sheet } = setup())
    fireEvent.change(within(sheet).getByLabelText('Take photo'), { target: { files: [photo()] } })
    await screen.findByText('analysis page')
    expect((await getOriginal(9))?.name).toBe('food-buddy-9.jpg')
    await dropOriginal(9)
  })

  it('keeps a photo taken without a connection and closes the sheet', async () => {
    const { fetch, sheet } = setup({ type: 'lunch' }, () => Promise.reject(new TypeError('Load failed')))
    fireEvent.change(within(sheet).getByLabelText('Take photo'), { target: { files: [photo()] } })
    expect(await screen.findByText(/No connection: kept on this phone. The photo uploads when you’re back online/)).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Add food' })).not.toBeInTheDocument()
    expect(screen.queryByText('analysis page')).not.toBeInTheDocument()
    expect(fetch).toHaveBeenCalledTimes(1)
    const [kept] = await pending()
    expect([kept.path, kept.label, kept.form?.fields]).toEqual(['/analyses', 'Photo of lunch', [['kind', 'meal'], ['meal_type', 'lunch']]])
  })

  it('saves a library photo for later without a meal type, and "Our meals" needs a meal', async () => {
    const { fetch, sheet } = setup()
    fireEvent.click(within(sheet).getByRole('button', { name: 'For later' }))
    expect(within(sheet).getByRole('button', { name: /Our meals/ })).toBeDisabled()
    fireEvent.change(within(sheet).getByLabelText('Choose from library'), { target: { files: [photo()] } })
    await screen.findByText('analysis page')
    expect(form(fetch).get('save_only')).toBe('true')
    expect(form(fetch).get('meal_type')).toBeNull()
  })

  it('scans a label in the background and stays home', async () => {
    const { fetch, sheet } = setup()
    fireEvent.change(within(sheet).getByLabelText('Scan a nutrition label'), { target: { files: [photo()] } })
    expect(await screen.findByText(/Reading the label… it shows up above the tabs/)).toBeInTheDocument()
    expect(form(fetch).get('kind')).toBe('label')
    expect(form(fetch).get('meal_type')).toBeNull()
    expect(screen.queryByText('analysis page')).not.toBeInTheDocument()
  })

  it('shows upload errors, ignores empty picks and lets the same photo be picked again', async () => {
    const { fetch, sheet } = setup(undefined, () => jsonResponse({ detail: 'Photo too large' }, 413))
    const input = within(sheet).getByLabelText('Take photo') as HTMLInputElement
    fireEvent.change(input, { target: { files: [] } })
    expect(fetch).not.toHaveBeenCalled()
    fireEvent.change(input, { target: { files: [photo()] } })
    expect(await within(sheet).findByRole('alert')).toHaveTextContent('Photo too large')
    expect(input.value).toBe('')
    fireEvent.change(input, { target: { files: [photo()] } })
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
  })

  it('disables every option while uploading', async () => {
    const { sheet } = setup(undefined, (() => new Promise(() => {})) as never)
    fireEvent.change(within(sheet).getByLabelText('Take photo'), { target: { files: [photo()] } })
    expect(await within(sheet).findByText('Uploading photo…')).toBeInTheDocument()
    expect(within(sheet).getByLabelText('Take photo')).toBeDisabled()
    expect(within(sheet).getByLabelText('Choose from library')).toBeDisabled()
    expect(within(sheet).getByRole('button', { name: /Type it/ })).toBeDisabled()
  })

  it('types a meal with its meal type, or a snack', async () => {
    const { fetch, sheet } = setup({ type: 'dinner' })
    fireEvent.click(within(sheet).getByRole('button', { name: /Type it/ }))
    expect(within(sheet).getByRole('heading', { name: 'What did you eat?' })).toBeInTheDocument()
    fireEvent.change(within(sheet).getByLabelText('Dish'), { target: { value: '  spaghetti carbonara ' } })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Estimate it' }))
    expect(await screen.findByText('analysis page')).toBeInTheDocument()
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe('/api/analyses/text')
    expect(JSON.parse(String(init!.body))).toEqual({ kind: 'meal', text: 'spaghetti carbonara', meal_type: 'dinner', save_only: false })
  })

  it('types a snack: a meal typed Snack, checked on the same screen; blank text is skipped', async () => {
    const { fetch, sheet } = setup()
    fireEvent.click(within(sheet).getByRole('button', { name: 'Snack' }))
    fireEvent.click(within(sheet).getByRole('button', { name: /Type it/ }))
    expect(within(sheet).getByRole('heading', { name: 'What snack was it?' })).toBeInTheDocument()
    fireEvent.change(within(sheet).getByLabelText('Snack'), { target: { value: '   ' } })
    fireEvent.submit(within(sheet).getByRole('button', { name: 'Estimate it' }).closest('form')!)
    expect(fetch).not.toHaveBeenCalled()
    fireEvent.change(within(sheet).getByLabelText('Snack'), { target: { value: 'chia pudding' } })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Estimate it' }))
    expect(await screen.findByText('analysis page')).toBeInTheDocument()
    expect(JSON.parse(String(fetch.mock.calls[0][1]!.body))).toEqual({ kind: 'meal', text: 'chia pudding', meal_type: 'snack', save_only: false })
  })

  it('sends a snack photo for its ingredients, like a meal', async () => {
    const { fetch, sheet } = setup({ type: 'snack' })
    expect(within(sheet).getByText(/A home-made snack or a drink/)).toBeInTheDocument()
    fireEvent.change(within(sheet).getByLabelText('Take photo'), { target: { files: [photo()] } })
    expect(await screen.findByText('analysis page')).toBeInTheDocument()
    expect(form(fetch).get('kind')).toBe('meal')
    expect(form(fetch).get('meal_type')).toBe('snack')
  })

  it('goes back from a sub view to all options', () => {
    const { sheet } = setup()
    fireEvent.click(within(sheet).getByRole('button', { name: /Type it/ }))
    fireEvent.click(within(sheet).getByRole('button', { name: /All options/ }))
    expect(within(sheet).getByRole('heading', { name: 'Add food' })).toBeInTheDocument()
  })

  it('logs one of our meals for the chosen slot', async () => {
    let cooked: unknown
    setup({ type: 'dinner' }, ((url: string, init?: RequestInit) => {
      if (url === '/api/meals') return jsonResponse([card({ id: 1, name: 'Oats', types: ['breakfast'] }), card({ id: 3, name: 'Chicken rice bowl', types: ['dinner'] })])
      if (url.endsWith('/cook')) {
        cooked = JSON.parse(String(init!.body))
        return jsonResponse(meal())
      }
      return jsonResponse(meal())
    }) as never)
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Add food' })).getByRole('button', { name: /Our meals/ }))
    const sheet = screen.getByRole('dialog', { name: 'Add food' })
    expect(within(sheet).getByRole('heading', { name: 'Dinner from our meals' })).toBeInTheDocument()
    const names = () => within(within(sheet).getByLabelText('Your meals')).getAllByRole('button').map((b) => b.textContent)
    await waitFor(() => expect(names()[0]).toMatch(/Chicken rice bowl/)) // dinner meals first
    fireEvent.change(within(sheet).getByLabelText('Search meals'), { target: { value: 'pizza' } })
    expect(within(sheet).getByText('No meal matches.')).toBeInTheDocument()
    fireEvent.change(within(sheet).getByLabelText('Search meals'), { target: { value: 'rice' } })
    fireEvent.click(within(sheet).getByRole('button', { name: /Chicken rice bowl/ }))

    const log = await screen.findByRole('dialog', { name: 'Log this meal' })
    expect(within(log).getByRole('button', { name: 'Dinner' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(within(log).getByRole('button', { name: 'Log 552 kcal' }))
    await waitFor(() => expect(cooked).toMatchObject({ meal_type: 'dinner', eaten_on: '2026-10-04', cooked: true }))
  })

  it('opens the snack sheet', async () => {
    const { sheet } = setup(undefined, (() => jsonResponse([])) as never)
    fireEvent.click(within(sheet).getByRole('button', { name: /Quick snack/ }))
    expect(await screen.findByRole('dialog', { name: 'Log a snack' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Add food' })).not.toBeInTheDocument()
  })
})
