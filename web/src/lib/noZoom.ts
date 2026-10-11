// Native-app feel: iOS Safari ignores user-scalable=no, so pinch zoom is blocked via its
// non-standard gesture events. Double-tap zoom is handled by `touch-action` in styles.css.

const block = (e: Event) => e.preventDefault()

export function disablePinchZoom(target: EventTarget = document) {
  target.addEventListener('gesturestart', block, { passive: false })
  target.addEventListener('gesturechange', block, { passive: false })
  return () => {
    target.removeEventListener('gesturestart', block)
    target.removeEventListener('gesturechange', block)
  }
}
