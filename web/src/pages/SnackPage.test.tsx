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

describe('SnackPage', () => {
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
