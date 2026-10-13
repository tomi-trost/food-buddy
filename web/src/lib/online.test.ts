import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isOffline, reportReachable, useOffline } from './online'

beforeEach(() => reportReachable(true))
afterEach(() => vi.restoreAllMocks())

describe('online state', () => {
  it('is online by default', () => {
    expect(isOffline()).toBe(false)
  })

  it('follows the browser going offline and back', () => {
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    const { result } = renderHook(() => useOffline())
    onLine.mockReturnValue(false)
    act(() => void window.dispatchEvent(new Event('offline')))
    expect(result.current).toBe(true)
    onLine.mockReturnValue(true)
    act(() => void window.dispatchEvent(new Event('online')))
    expect(result.current).toBe(false)
  })

  it('counts an unreachable server as offline although the browser says online', () => {
    const { result } = renderHook(() => useOffline())
    act(() => reportReachable(false))
    expect(result.current).toBe(true)
    act(() => reportReachable(true))
    expect(result.current).toBe(false)
  })

  it('clears an unreachable server when the browser reports a connection again', () => {
    const { result } = renderHook(() => useOffline())
    act(() => reportReachable(false))
    act(() => void window.dispatchEvent(new Event('online')))
    expect(result.current).toBe(false)
  })
})
