import { fireEvent, screen, within } from '@testing-library/react'
import { Route } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { tokenStore } from '../api/client'
import { jsonResponse, mockFetch, renderAt } from '../test/utils'
import { SnapPage } from './SnapPage'

beforeEach(() => tokenStore.set('tok'))

describe('SnapPage', () => {
  it('uploads the photo and keeps the meal type for the next step', async () => {
    const fetch = mockFetch(() => jsonResponse({ id: 9, status: 'queued' }, 202))
    renderAt('/snap?type=breakfast', (
      <>
        <Route path="/snap" element={<SnapPage />} />
        <Route path="/analysis/:id" element={<p>analysis page</p>} />
      </>
    ))
    const input = screen.getByLabelText('Take photo') as HTMLInputElement
    expect(input).toHaveAttribute('capture', 'environment')
    fireEvent.change(input, { target: { files: [new File(['x'], 'p.jpg', { type: 'image/jpeg' })] } })
    expect(await screen.findByText('analysis page')).toBeInTheDocument()
    expect(fetch.mock.calls[0][0]).toBe('/api/analyses')
  })

  it('uploads a photo picked from the library (no camera capture)', async () => {
    const fetch = mockFetch(() => jsonResponse({ id: 4, status: 'queued' }, 202))
    renderAt('/snap?type=lunch', (
      <>
        <Route path="/snap" element={<SnapPage />} />
        <Route path="/analysis/:id" element={<p>analysis page</p>} />
      </>
    ))
    const input = screen.getByLabelText('Choose from library') as HTMLInputElement
    expect(input).toHaveAttribute('accept', 'image/*')
    expect(input).not.toHaveAttribute('capture')
    fireEvent.change(input, { target: { files: [new File(['x'], 'old.jpg', { type: 'image/jpeg' })] } })
    expect(await screen.findByText('analysis page')).toBeInTheDocument()
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('ignores an empty pick and lets the same photo be picked again after an error', async () => {
    const fetch = mockFetch(() => jsonResponse({ detail: 'Too large' }, 413))
    renderAt('/snap', <Route path="/snap" element={<SnapPage />} />)
    const input = screen.getByLabelText('Choose from library') as HTMLInputElement
    fireEvent.change(input, { target: { files: [] } })
    expect(fetch).not.toHaveBeenCalled()
    const photo = new File(['x'], 'p.jpg', { type: 'image/jpeg' })
    fireEvent.change(input, { target: { files: [photo] } })
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(input.value).toBe('')
    fireEvent.change(input, { target: { files: [photo] } })
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
  })

  it('disables both pickers while uploading', async () => {
    mockFetch(() => new Promise(() => {}))
    renderAt('/snap', <Route path="/snap" element={<SnapPage />} />)
    const library = screen.getByLabelText('Choose from library') as HTMLInputElement
    fireEvent.change(library, { target: { files: [new File(['x'], 'p.jpg', { type: 'image/jpeg' })] } })
    expect(await screen.findByText('Uploading photo…')).toBeInTheDocument()
    expect(screen.getByLabelText('Take photo')).toBeDisabled()
    expect(library).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Snack' })).toBeDisabled()
  })

  it('switches between meal, snack and label and uploads with the chosen kind', async () => {
    const fetch = mockFetch(() => jsonResponse({ id: 5, status: 'queued' }, 202))
    renderAt('/snap?type=lunch', (
      <>
        <Route path="/snap" element={<SnapPage />} />
        <Route path="/" element={<p>home</p>} />
      </>
    ))
    expect(screen.getByRole('heading', { name: 'Snap your lunch' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Meal' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Label' }))
    expect(screen.getByRole('heading', { name: 'Scan a nutrition label' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Label' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.change(screen.getByLabelText('Take photo'), { target: { files: [new File(['x'], 'l.jpg', { type: 'image/jpeg' })] } })
    // labels and snacks run in the background: back home, the banner picks it up
    expect(await screen.findByText('home')).toBeInTheDocument()
    expect(screen.getByText(/Reading the label… it shows up above the tabs/)).toBeInTheDocument()
    expect((fetch.mock.calls[0][1]!.body as FormData).get('kind')).toBe('label')
  })

  it('opens the camera from both the viewfinder and the shutter', () => {
    renderAt('/snap', <Route path="/snap" element={<SnapPage />} />)
    const camera = screen.getByLabelText('Take photo')
    const targets = document.querySelectorAll(`label[for="${camera.id}"]`)
    expect(targets).toHaveLength(2)
    expect(screen.getByText('Tap to take a photo').closest('label')).toBe(targets[0])
  })

  it('sends the chosen meal type with the photo', async () => {
    const fetch = mockFetch(() => jsonResponse({ id: 9, status: 'queued' }, 202))
    renderAt('/snap?type=lunch', (
      <>
        <Route path="/snap" element={<SnapPage />} />
        <Route path="/analysis/:id" element={<p>analysis page</p>} />
      </>
    ))
    expect(screen.getByRole('button', { name: 'Lunch' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Dinner' }))
    expect(screen.getByRole('heading', { name: 'Snap your dinner' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Take photo'), { target: { files: [new File(['x'], 'p.jpg', { type: 'image/jpeg' })] } })
    await screen.findByText('analysis page')
    const form = fetch.mock.calls[0][1]!.body as FormData
    expect(form.get('meal_type')).toBe('dinner')
    expect(form.get('save_only')).toBeNull()
  })

  it('saves a meal for later without a meal type', async () => {
    const fetch = mockFetch(() => jsonResponse({ id: 9, status: 'queued' }, 202))
    renderAt('/snap', (
      <>
        <Route path="/snap" element={<SnapPage />} />
        <Route path="/analysis/:id" element={<p>analysis page</p>} />
      </>
    ))
    fireEvent.click(screen.getByRole('button', { name: 'For later' }))
    expect(screen.getByRole('heading', { name: 'Save a meal for later' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Dinner' })).toHaveAttribute('aria-pressed', 'false')
    fireEvent.change(screen.getByLabelText('Choose from library'), { target: { files: [new File(['x'], 'old.jpg', { type: 'image/jpeg' })] } })
    await screen.findByText('analysis page')
    const form = fetch.mock.calls[0][1]!.body as FormData
    expect(form.get('save_only')).toBe('true')
    expect(form.get('meal_type')).toBeNull()
  })

  it('hides the meal choice for snacks and labels', () => {
    renderAt('/snap?kind=snack', <Route path="/snap" element={<SnapPage />} />)
    expect(screen.queryByRole('group', { name: 'Which meal is it?' })).not.toBeInTheDocument()
  })

  describe('typing instead of snapping', () => {
    const routes = (
      <>
        <Route path="/snap" element={<SnapPage />} />
        <Route path="/analysis/:id" element={<p>analysis page</p>} />
        <Route path="/" element={<p>home</p>} />
      </>
    )

    it('sends a typed meal with its meal type and opens the check screen', async () => {
      const fetch = mockFetch(() => jsonResponse({ id: 12, status: 'queued' }, 202))
      renderAt('/snap?type=dinner', routes)
      fireEvent.click(screen.getByRole('button', { name: /Type it/ }))
      const sheet = screen.getByRole('dialog', { name: 'Type it instead' })
      expect(within(sheet).getByRole('heading', { name: 'What did you eat?' })).toBeInTheDocument()
      fireEvent.change(within(sheet).getByLabelText('Dish'), { target: { value: '  spaghetti carbonara ' } })
      fireEvent.click(within(sheet).getByRole('button', { name: 'Estimate it' }))
      expect(await screen.findByText('analysis page')).toBeInTheDocument()
      const [url, init] = fetch.mock.calls[0]
      expect(url).toBe('/api/analyses/text')
      expect(JSON.parse(String(init!.body))).toEqual({ kind: 'meal', text: 'spaghetti carbonara', meal_type: 'dinner', save_only: false })
    })

    it('sends a typed snack and goes home to wait for it', async () => {
      const fetch = mockFetch(() => jsonResponse({ id: 13, status: 'queued' }, 202))
      renderAt('/snap?kind=snack', routes)
      fireEvent.click(screen.getByRole('button', { name: /Type it/ }))
      fireEvent.change(screen.getByLabelText('Snack'), { target: { value: '2 slices of tiramisu' } })
      fireEvent.click(screen.getByRole('button', { name: 'Estimate it' }))
      expect(await screen.findByText('home')).toBeInTheDocument()
      expect(JSON.parse(String(fetch.mock.calls[0][1]!.body))).toMatchObject({ kind: 'snack', text: '2 slices of tiramisu', meal_type: null })
    })

    it('does not send blank text and shows server errors', async () => {
      const fetch = mockFetch(() => jsonResponse({ detail: 'String should have at most 200 characters' }, 422))
      renderAt('/snap?type=lunch', routes)
      fireEvent.click(screen.getByRole('button', { name: /Type it/ }))
      const sheet = screen.getByRole('dialog', { name: 'Type it instead' })
      fireEvent.change(within(sheet).getByLabelText('Dish'), { target: { value: '   ' } })
      fireEvent.submit(within(sheet).getByRole('button', { name: 'Estimate it' }).closest('form')!)
      expect(fetch).not.toHaveBeenCalled()
      fireEvent.change(within(sheet).getByLabelText('Dish'), { target: { value: 'pasta' } })
      fireEvent.click(within(sheet).getByRole('button', { name: 'Estimate it' }))
      expect(await within(sheet).findByRole('alert')).toHaveTextContent('at most 200 characters')
    })

    it('is not offered for labels (they need the photo)', () => {
      renderAt('/snap?kind=label', routes)
      expect(screen.queryByRole('button', { name: /Type it/ })).not.toBeInTheDocument()
    })
  })
})
