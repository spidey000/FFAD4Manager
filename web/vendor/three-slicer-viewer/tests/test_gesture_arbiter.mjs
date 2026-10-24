import assert from 'node:assert/strict'
import { createGestureArbiter, TAP_MS, TAP_SLOP } from '../src/scene/gesture_arbiter.js'

const arb = () => createGestureArbiter()

// A press that stays put and releases quickly is a tap.
{
  const g = arb()
  assert.equal(g.press(1, 100, 100, 1000).state, 'pendingTap')
  assert.deepEqual(g.release(1, 100, 100, 1000 + TAP_MS), { state: 'idle', tap: true })
  assert.equal(g.pointerCount, 0)
}

// A press that becomes an orbit never selects, even if it releases inside the slop.
{
  const g = arb()
  g.press(1, 100, 100, 0)
  assert.equal(g.move(1, 100 + TAP_SLOP, 100).state, 'orbiting')
  assert.deepEqual(g.release(1, 100 + TAP_SLOP, 100, 50), { state: 'idle', tap: false })
}

// Small jitter inside the slop stays a tap.
{
  const g = arb()
  g.press(1, 100, 100, 0)
  assert.equal(g.move(1, 100 + TAP_SLOP - 1, 100).moved, false)
  assert.equal(g.release(1, 100 + TAP_SLOP - 1, 100, 100).tap, true)
}

// Too slow is a long press, not a tap.
{
  const g = arb()
  g.press(1, 100, 100, 0)
  assert.equal(g.release(1, 100, 100, TAP_MS + 1).tap, false)
}

// A second pointer hands the gesture to the camera and no release is a tap.
{
  const g = arb()
  g.press(1, 10, 10, 0)
  assert.equal(g.press(2, 40, 40, 10).second, true)
  assert.equal(g.state, 'cameraMultiTouch')
  assert.equal(g.release(1, 10, 10, 20).tap, false)
  assert.equal(g.release(2, 40, 40, 30).tap, false)
  assert.equal(g.state, 'idle')
}

// A claimed mode (painting) never turns its release into a tap, and a second finger still reaches the camera.
{
  const g = arb()
  g.press(1, 10, 10, 0)
  g.claim('painting')
  assert.equal(g.release(1, 10, 10, 10).tap, false)
  g.press(1, 10, 10, 20); g.claim('painting')
  assert.equal(g.press(2, 20, 20, 30).second, true)
  assert.equal(g.state, 'cameraMultiTouch')
}

// Cancellation forgets the press and leaves no tap behind; the last pointer returns the surface to idle.
{
  const g = arb()
  g.press(1, 10, 10, 0)
  assert.equal(g.cancel(1), 'idle')
  assert.equal(g.state, 'idle')
  assert.equal(g.pointerCount, 0)
  g.press(1, 10, 10, 0); g.press(2, 20, 20, 0)
  assert.equal(g.cancel(1), 'cameraMultiTouch')
  assert.equal(g.cancel(2), 'idle')
}

// One finger back after a two-finger gesture does not resume anything by itself: a new contact is required.
{
  const g = arb()
  g.press(1, 0, 0, 0); g.press(2, 10, 10, 0)
  g.release(2, 10, 10, 10)
  assert.equal(g.state, 'pendingTap')
  assert.equal(g.pointerCount, 1)
  assert.equal(g.press(3, 50, 50, 20).second, true)
}

console.log('gesture_arbiter: ok')
