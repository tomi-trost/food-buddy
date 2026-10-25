import { act, screen, waitFor } from '@testing-library/react'
import { Route } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import { reportReachable } from '../lib/online'
import { enqueue, pending } from '../lib/outbox'
import { jsonResponse, mockFetch, renderAt } from '../test/utils'
import { OfflineBanner } from './OfflineBanner'

const routes = <Route index element={<OfflineBanner />} />

beforeEach(() => reportReachable(true))

describe('OfflineBanner', () => {
  it('shows nothing while online', () => {
    renderAt('/', routes)
    expect(screen.queryByText(/offline/)).not.toBeInTheDocument()
  })

  it('says so when offline and toasts when the connection is back', () => {
    renderAt('/', routes)
    act(() => reportReachable(false))
    expect(screen.getByText("You're offline.")).toBeInTheDocument()
    expect(screen.queryByText('Back online')).not.toBeInTheDocument()

    act(() => reportReachable(true))
    expect(screen.queryByText("You're offline.")).not.toBeInTheDocument()
    expect(screen.getByText('Back online')).toBeInTheDocument()
  })

  it('shows on first render when already offline, without a toast', () => {
    reportReachable(false)
    renderAt('/', routes)
    expect(screen.getByText("You're offline.")).toBeInTheDocument()
    expect(screen.queryByText('Back online')).not.toBeInTheDocument()
  })
})

describe('OfflineBanner: changes made offline', () => {
  it('counts what waits, sends it when back and says what went through or not', async () => {
    reportReachable(false)
    await enqueue({ path: '/snacks', method: 'POST', json: '{}', label: 'Log Apple' })
    await enqueue({ path: '/meals/2/cook', method: 'POST', json: '{}', label: 'Log Gone' })
    const fetch = mockFetch((url) => (url === '/api/meals/2/cook' ? jsonResponse({ detail: 'Meal not found' }, 404) : jsonResponse({})))
    renderAt('/', routes)
    expect(await screen.findByText('2 changes waiting')).toBeInTheDocument()
    expect(fetch).not.toHaveBeenCalled()

    act(() => reportReachable(true))
    expect(await screen.findByText("1 change made offline sent · Couldn't save “Log Gone”: Meal not found")).toBeInTheDocument()
    await waitFor(async () => expect(await pending()).toEqual([]))
    await waitFor(() => expect(screen.queryByText(/waiting|Sending/)).not.toBeInTheDocument())
  })

  it('shows changes still being sent while online', async () => {
    await enqueue({ path: '/snacks', method: 'POST', json: '{}', label: 'Log Apple' })
    mockFetch(() => jsonResponse({ detail: 'down' }, 503)) // server trouble: kept, tried again later
    renderAt('/', routes)
    expect(await screen.findByText('Sending 1 change made offline…')).toBeInTheDocument()
  })
})
