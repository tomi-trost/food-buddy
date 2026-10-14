import { fireEvent, screen } from '@testing-library/react'
import { Route } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { tokenStore } from '../api/client'
import type { AnalysisJob } from '../api/types'
import { analysisJob } from '../test/fixtures'
import { jsonResponse, mockFetch, renderAt } from '../test/utils'
import { SnackPage } from './SnackPage'

const COOKIE = analysisJob({
  kind: 'snack', status: 'done',
  snack: { name: 'Cookie', kind: 'sweet', per: 'piece', amount: 2, per_unit: { kcal: 80, protein: 1, carbs: 10, fat: 4, fiber: 0.5, sugar: 6 } },
})

const routes = (
  <>
    <Route path="/" element={<p>home</p>} />
    <Route path="/snack/:id" element={<SnackPage />} />
  </>
)

function serve(job: () => AnalysisJob, over: (url: string, init?: RequestInit) => Response | undefined = () => undefined) {
  return mockFetch((url, init) => over(url, init) ?? (url === '/api/analyses/5' ? jsonResponse(job()) : new Response('img')))
}

beforeEach(() => {
  tokenStore.set('tok')
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} }))
})

const BISCOTTI = analysisJob({
  kind: 'label', status: 'done',
  snack: { name: 'Biscotti', kind: 'sweet', per: '100g', amount: 45, per_unit: { kcal: 448, protein: 16, carbs: 54, fat: 17, fiber: 7.6, sugar: 17 } },
})

describe('SnackPage', () => {
  it('lets you correct the values read from a label before logging', async () => {
    const fetch = serve(() => BISCOTTI, (url) => (url === '/api/snacks' ? jsonResponse({ id: 1 }, 201) : undefined))
    renderAt('/snack/5', routes)
    expect(await screen.findByRole('heading', { name: 'Values per 100 g' })).toBeInTheDocument()
    expect(screen.getByTestId('macro-protein')).toHaveTextContent('7 g') // 16 × 45 / 100
    fireEvent.click(screen.getByRole('button', { name: 'Edit values' }))
    fireEvent.change(screen.getByLabelText('protein (g)'), { target: { value: '20' } })
    fireEvent.change(screen.getByLabelText('fiber (g)'), { target: { value: '8,1' } })
    expect(screen.getByTestId('macro-protein')).toHaveTextContent('9 g') // 20 × 45 / 100
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.queryByLabelText('protein (g)')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Log snack' }))
    expect(await screen.findByText('home')).toBeInTheDocument()
    const [, init] = fetch.mock.calls.find(([url]) => url === '/api/snacks')!
    expect(JSON.parse(String(init!.body)).per_unit).toEqual({ kcal: 448, protein: 20, carbs: 54, fat: 17, fiber: 8.1, sugar: 17 })
  })

  it('blocks logging while a value is invalid', async () => {
    serve(() => BISCOTTI)
    renderAt('/snack/5', routes)
    fireEvent.click(await screen.findByRole('button', { name: 'Edit values' }))
    const fat = screen.getByLabelText('fat (g)')
    fireEvent.change(fat, { target: { value: '' } })
    expect(fat).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('alert')).toHaveTextContent('Fix the values marked in red.')
    expect(screen.getByRole('button', { name: 'Log snack' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Done' })).toBeDisabled() // keep the red field visible
    expect(screen.getByTestId('macro-fat')).toHaveTextContent('8 g') // last valid value stays: 17 × 45 / 100

    fireEvent.change(fat, { target: { value: '15' } })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Log snack' })).toBeEnabled()
  })

  it('edits per piece for snack photos', async () => {
    serve(() => COOKIE)
    renderAt('/snack/5', routes)
    expect(await screen.findByRole('heading', { name: 'Values per piece' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Edit values' }))
    expect(screen.getByLabelText('kcal')).toHaveValue('80')
  })

  it('weighs a snack the model counted in pieces, through one portion\'s weight', async () => {
    const pudding = analysisJob({
      kind: 'snack', status: 'done',
      snack: { name: 'Chia pudding', kind: 'sweet', per: 'piece', amount: 1, per_unit: { kcal: 300, protein: 9, carbs: 30, fat: 15, fiber: 12, sugar: 15 } },
    })
    const fetch = serve(() => pudding, (url) => (url === '/api/snacks' ? jsonResponse({ id: 1 }, 201) : undefined))
    renderAt('/snack/5', routes)
    fireEvent.click(await screen.findByRole('button', { name: 'Grams' }))
    expect(screen.getByRole('heading', { name: 'Values per 100 g' })).toBeInTheDocument()
    const weight = screen.getByRole('textbox', { name: 'piece weight' })
    fireEvent.focus(weight)
    fireEvent.change(weight, { target: { value: '200' } }) // one jar: 200 g
    fireEvent.blur(weight)
    expect(screen.getByTestId('macro-kcal')).toHaveTextContent('150') // still 100 g eaten: half the jar

    fireEvent.click(screen.getByRole('button', { name: 'Log snack' }))
    expect(await screen.findByText('home')).toBeInTheDocument()
    const [, init] = fetch.mock.calls.find(([url]) => url === '/api/snacks')!
    const body = JSON.parse(String(init!.body))
    expect(body).toMatchObject({ per: '100g', amount: 100 })
    expect(body.per_unit.kcal).toBe(150)
  })

  it('shows a drink in ml', async () => {
    serve(() => analysisJob({
      kind: 'snack', status: 'done',
      snack: { name: 'Cola', kind: 'drink', per: '100ml', amount: 330, per_unit: { kcal: 42, protein: 0, carbs: 10.6, fat: 0, fiber: 0, sugar: 10.6 } },
    }))
    renderAt('/snack/5', routes)
    expect(await screen.findByRole('heading', { name: 'Values per 100 ml' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ml' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('ml you drank')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'piece weight' })).not.toBeInTheDocument()
  })

  it('logs the snack with its photo so it leaves the "to check" list', async () => {
    const fetch = serve(() => COOKIE, (url) => (url === '/api/snacks' ? jsonResponse({ id: 1 }, 201) : undefined))
    renderAt('/snack/5', routes)
    fireEvent.click(await screen.findByRole('button', { name: 'Log snack' }))
    expect(await screen.findByText('home')).toBeInTheDocument()
    const [, init] = fetch.mock.calls.find(([url]) => url === '/api/snacks')!
    expect(JSON.parse(String(init!.body))).toMatchObject({ name: 'Cookie', amount: 2, source: 'photo', analysis_id: 5 })
  })

  it('says so when the partner logged it first', async () => {
    let logged = false
    serve(
      () => (logged ? { ...COOKIE, closed: true } : COOKIE),
      (url) => {
        if (url !== '/api/snacks') return undefined
        logged = true
        return jsonResponse({ detail: 'This photo was already logged or discarded' }, 409)
      },
    )
    renderAt('/snack/5', routes)
    fireEvent.click(await screen.findByRole('button', { name: 'Log snack' }))
    expect(await screen.findByRole('heading', { name: 'Already done' })).toBeInTheDocument()
  })

  it('can be left while reading and checked later', async () => {
    serve(() => analysisJob({ kind: 'label', status: 'running' }))
    renderAt('/snack/5', routes)
    expect(await screen.findByRole('status', { name: 'Reading label' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Check it later' }))
    expect(screen.getByText('home')).toBeInTheDocument()
  })

  it('retries a failed photo', async () => {
    let job = analysisJob({ kind: 'snack', status: 'failed', error: 'model timed out' })
    serve(() => job, (url) => {
      if (url !== '/api/analyses/5/retry') return undefined
      job = analysisJob({ kind: 'snack', status: 'queued' })
      return jsonResponse(job, 202)
    })
    renderAt('/snack/5', routes)
    expect(await screen.findByText('model timed out')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('status', { name: 'Identifying snack' })).toBeInTheDocument()
  })

  it('discards the photo', async () => {
    const fetch = serve(() => analysisJob({ kind: 'snack' }), (url) =>
      url === '/api/analyses/5/discard' ? jsonResponse(analysisJob({ kind: 'snack', closed: true })) : undefined)
    renderAt('/snack/5', routes)
    fireEvent.click(await screen.findByRole('button', { name: 'Discard this photo' }))
    expect(await screen.findByText('home')).toBeInTheDocument()
    expect(fetch.mock.calls.some(([url, init]) => url === '/api/analyses/5/discard' && init?.method === 'POST')).toBe(true)
  })
})
