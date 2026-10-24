// Gesture ownership for the scene surface: one owner per gesture, decided before anything mutable runs.
// The spec's states are kept here so selection, painting and camera navigation cannot each invent their own rule.
// A tap is confirmed on RELEASE (<=250 ms, <8 px), never on press: a press that turns into an orbit must not change
// the selection. Callers claim a state when a non-tap gesture starts (painting/transforming) so its release is not
// mistaken for a tap, and a second pointer always hands the gesture to the camera.
export const TAP_MS = 250
export const TAP_SLOP = 8

export function createGestureArbiter({ tapMs = TAP_MS, tapSlop = TAP_SLOP } = {}) {
  const pointers = new Set()
  let press = null
  let state = 'idle'
  const out = (extra = {}) => ({ state, ...extra })

  return {
    /** A new contact. `second` means the camera owns the gesture and the caller must not start paint/transform. */
    press(id, x, y, time) {
      pointers.add(id)
      if (pointers.size > 1) { press = null; state = 'cameraMultiTouch'; return out({ second: true }) }
      press = { id, x, y, time }
      state = 'pendingTap'
      return out({ second: false })
    },
    move(id, x, y) {
      if (state !== 'pendingTap' || press?.id !== id) return out({ moved: false })
      if (Math.hypot(x - press.x, y - press.y) >= tapSlop) state = 'orbiting'
      return out({ moved: state === 'orbiting' })
    },
    release(id, x, y, time) {
      pointers.delete(id)
      const own = press?.id === id
      const tap = own && state === 'pendingTap' && time - press.time <= tapMs
      if (own) press = null
      state = pointers.size === 0 ? 'idle' : pointers.size > 1 ? 'cameraMultiTouch' : 'pendingTap'
      return out({ tap })
    },
    /** Cancellation never becomes a tap: the operation is aborted, the pointer is forgotten. */
    cancel(id) {
      pointers.delete(id)
      press = null
      state = pointers.size ? 'cameraMultiTouch' : 'idle'
      return state
    },
    /** A mode takes ownership (painting/transforming/orbiting): the press is no longer a candidate tap. */
    claim(next) { press = null; state = next; return state },
    get state() { return state },
    get pointerCount() { return pointers.size },
  }
}
