import { fireEvent, screen } from '@testing-library/react'
import { Route } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { tokenStore } from '../api/client'
import type { AnalysisJob } from '../api/types'
import { analysisJob, doneJob } from '../test/fixtures'
import { jsonResponse, mockFetch, renderAt } from '../test/utils'
import { AppLayout } from './AppLayout'

const routes = (
  <>
    <Route element={<AppLayout />}>
      <Route index element={<p>home</p>} />
    </Route>
    <Route path="/analysis/:id" element={<p>analysis page</p>} />
    <Route path="/snack/:id" element={<p>snack page</p>} />
  </>
)

function serve(open: () => AnalysisJob[], extra: (url: string) => Response | undefined = () => undefined) {
  return mockFetch((url) => {
    const hit = extra(url)
    if (hit) return hit
    if (url === '/api/auth/me') return jsonResponse({ id: 1, name: 'Tomi' })
    if (url === '/api/analyses/open') return jsonResponse(open())
    return new Response('img')
  })
}

beforeEach(() => {
  tokenStore.set('tok')
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} }))
})

describe('PendingBanner', () => {
  it('stays hidden when nothing is waiting', async () => {
    const fetch = serve(() => [])
    renderAt('/', routes)
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/analyses/open', expect.anything()))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('shows an analyzing meal and opens it to rate', async () => {
    serve(() => [analysisJob({ status: 'running' })])
    renderAt('/', routes)
    const link = await screen.findByRole('link', { name: /Analyzing your meal…/ })
    expect(link).toHaveTextContent('Rate it')
    fireEvent.click(link)
    expect(screen.getByText('analysis page')).toBeInTheDocument()
  })

  it('switches to "ready to check" once the analysis finishes', async () => {
    let done = false
    serve(() => [done ? doneJob() : analysisJob({ status: 'running' })])
    renderAt('/', routes)
    await screen.findByRole('link', { name: /Analyzing your meal…/ })
    done = true
    const ready = await screen.findByRole('link', { name: /Chicken rice bowl is ready to check/ }, { timeout: 7000 })
    expect(ready).toHaveClass('ready')
    expect(ready).toHaveTextContent('Review')
  }, 10000)

  it("shows the partner's snack and how many more are waiting", async () => {
    serve(() => [
      analysisJob({ id: 7, kind: 'snack', status: 'failed', by: { id: 2, name: 'Ana' } }),
      analysisJob({ id: 8 }),
    ])
    renderAt('/', routes)
    const link = await screen.findByRole('link', { name: /Couldn't analyze Ana's snack/ })
    expect(link).toHaveTextContent('+1 more waiting')
    fireEvent.click(link)
    expect(screen.getByText('snack page')).toBeInTheDocument()
  })

  it('discards the photo from the banner, and Undo brings it back', async () => {
    let jobs = [analysisJob({ id: 5, status: 'running' })]
    const fetch = serve(() => jobs, (url) => {
      if (url === '/api/analyses/5/discard') { const j = analysisJob({ id: 5, closed: true }); jobs = []; return jsonResponse(j) }
      if (url === '/api/analyses/5/reopen') { jobs = [analysisJob({ id: 5, status: 'running' })]; return jsonResponse(jobs[0]) }
    })
    renderAt('/', routes)
    await screen.findByRole('link', { name: /Analyzing your meal…/ })
    fireEvent.click(screen.getByRole('button', { name: 'Discard this photo' }))
    await vi.waitFor(() => expect(screen.queryByRole('link', { name: /Analyzing your meal…/ })).not.toBeInTheDocument())
    expect(screen.getByText('home')).toBeInTheDocument() // stays where you are
    expect(fetch.mock.calls.some(([url, init]) => url === '/api/analyses/5/discard' && init?.method === 'POST')).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(await screen.findByRole('link', { name: /Analyzing your meal…/ })).toBeInTheDocument()
  })
})
