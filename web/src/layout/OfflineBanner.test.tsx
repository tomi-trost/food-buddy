import { act, screen } from '@testing-library/react'
import { Route } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import { reportReachable } from '../lib/online'
import { renderAt } from '../test/utils'
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
