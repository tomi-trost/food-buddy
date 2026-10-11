import { afterEach, describe, expect, it } from 'vitest'
import { disablePinchZoom } from './noZoom'

let undo: (() => void) | undefined
afterEach(() => undo?.())

const gesture = (type: string) => {
  const e = new Event(type, { cancelable: true })
  document.dispatchEvent(e)
  return e
}

describe('disablePinchZoom', () => {
  it('cancels iOS pinch gestures', () => {
    undo = disablePinchZoom()
    expect(gesture('gesturestart').defaultPrevented).toBe(true)
    expect(gesture('gesturechange').defaultPrevented).toBe(true)
  })

  it('leaves gestures alone once undone', () => {
    disablePinchZoom()()
    expect(gesture('gesturestart').defaultPrevented).toBe(false)
  })
})
