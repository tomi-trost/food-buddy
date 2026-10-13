import { act, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { watchForUpdates } from '../lib/swUpdate'
import { UpdatePrompt } from './UpdatePrompt'

const sw = vi.hoisted(() => ({
  updateServiceWorker: vi.fn(() => Promise.resolve()),
  options: undefined as undefined | { onRegisteredSW?: (url: string, r: ServiceWorkerRegistration | undefined) => void },
  setNeedRefresh: (() => {}) as (v: boolean) => void,
}))

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: (options: typeof sw.options) => {
    sw.options = options
    const needRefresh = useState(false)
    sw.setNeedRefresh = needRefresh[1]
    return { needRefresh, offlineReady: useState(false), updateServiceWorker: sw.updateServiceWorker }
  },
}))
vi.mock('../lib/swUpdate', () => ({ watchForUpdates: vi.fn(() => vi.fn()) }))

beforeEach(() => {
  sw.updateServiceWorker.mockClear()
  vi.mocked(watchForUpdates).mockClear()
})

describe('UpdatePrompt', () => {
  it('stays hidden until a new version is waiting', () => {
    render(<UpdatePrompt />)
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('reloads into the new version with one tap', () => {
    render(<UpdatePrompt />)
    act(() => sw.setNeedRefresh(true))
    const popup = screen.getByRole('alertdialog', { name: 'Update available' })
    expect(popup).toHaveTextContent('New version available')
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }))
    expect(sw.updateServiceWorker).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Reloading…' })).toBeDisabled()
  })

  it('can be put off until later', () => {
    render(<UpdatePrompt />)
    act(() => sw.setNeedRefresh(true))
    fireEvent.click(screen.getByRole('button', { name: 'Later' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(sw.updateServiceWorker).not.toHaveBeenCalled()
  })

  it('keeps checking for new versions once the service worker is registered, and stops on unmount', () => {
    const stop = vi.fn()
    vi.mocked(watchForUpdates).mockReturnValue(stop)
    const { unmount } = render(<UpdatePrompt />)
    const registration = {} as ServiceWorkerRegistration
    sw.options!.onRegisteredSW!('/sw.js', registration)
    expect(watchForUpdates).toHaveBeenCalledWith(registration)
    sw.options!.onRegisteredSW!('/sw.js', undefined) // no service worker (unsupported browser): nothing to watch
    expect(watchForUpdates).toHaveBeenCalledTimes(1)
    unmount()
    expect(stop).toHaveBeenCalled()
  })
})
