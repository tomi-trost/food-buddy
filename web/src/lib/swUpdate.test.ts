import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CHECK_EVERY_MS, watchForUpdates } from './swUpdate'

const registration = (over: Partial<ServiceWorkerRegistration> = {}) =>
  ({ installing: null, update: vi.fn(() => Promise.resolve()), ...over }) as unknown as ServiceWorkerRegistration & { update: ReturnType<typeof vi.fn> }

const setVisibility = (state: DocumentVisibilityState) => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: state })
  document.dispatchEvent(new Event('visibilitychange'))
}
const setOnline = (online: boolean) => Object.defineProperty(navigator, 'onLine', { configurable: true, value: online })

beforeEach(() => {
  vi.useFakeTimers()
  setOnline(true)
})
afterEach(() => {
  vi.useRealTimers()
  setOnline(true)
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
})

describe('watchForUpdates', () => {
  it('checks every half hour and when the app comes back to the foreground', () => {
    const reg = registration()
    const stop = watchForUpdates(reg)
    expect(reg.update).not.toHaveBeenCalled()
    vi.advanceTimersByTime(CHECK_EVERY_MS)
    expect(reg.update).toHaveBeenCalledTimes(1)

    setVisibility('hidden')
    expect(reg.update).toHaveBeenCalledTimes(1)
    setVisibility('visible')
    expect(reg.update).toHaveBeenCalledTimes(2)

    stop()
    vi.advanceTimersByTime(CHECK_EVERY_MS)
    setVisibility('visible')
    expect(reg.update).toHaveBeenCalledTimes(2)
  })

  it('skips the check while offline or while a new version is already installing', () => {
    const reg = registration()
    watchForUpdates(reg)
    setOnline(false)
    setVisibility('visible')
    expect(reg.update).not.toHaveBeenCalled()

    const busy = registration({ installing: {} as ServiceWorker })
    watchForUpdates(busy)
    setOnline(true)
    setVisibility('visible')
    expect(busy.update).not.toHaveBeenCalled()
  })

  it('swallows a failed check (expired access session, flaky network)', async () => {
    const reg = registration({ update: vi.fn(() => Promise.reject(new TypeError('redirect'))) } as never)
    watchForUpdates(reg)
    setVisibility('visible')
    await vi.runAllTicks()
    expect(reg.update).toHaveBeenCalledTimes(1) // no unhandled rejection fails the test run
  })
})
