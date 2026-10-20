import test from 'node:test'
import assert from 'node:assert/strict'
import { deriveResponsiveLayout, effectiveSheetSnap, focusTrapTarget, sheetSnapHeights, snapSheetHeight } from '../src/hooks/use_responsive_layout.js'

test('responsive layout uses container dimensions and scene fit', () => {
  assert.deepEqual(deriveResponsiveLayout(767, 800), { variant: 'compact', short: false })
  assert.deepEqual(deriveResponsiveLayout(390, 490), { variant: 'compact', short: true })
  assert.deepEqual(deriveResponsiveLayout(768, 900), { variant: 'intermediate', short: false })
  assert.deepEqual(deriveResponsiveLayout(959, 900), { variant: 'intermediate', short: false })
  assert.deepEqual(deriveResponsiveLayout(960, 800), { variant: 'expanded', short: false })
  assert.deepEqual(deriveResponsiveLayout(960, 800, 420), { variant: 'intermediate', short: false })
})

test('sheet release selects the nearest stop and only lets a fast fling bias one stop', () => {
  const { collapsed, half, expanded } = sheetSnapHeights(600)
  assert.equal(snapSheetHeight(collapsed + 4, 0, 600), 'collapsed')
  assert.equal(snapSheetHeight((collapsed + half) / 2 + 2, 0, 600), 'half')
  assert.equal(snapSheetHeight(half + 2, 0, 600), 'half')
  assert.equal(snapSheetHeight(collapsed + 10, 0.61, 600), 'half')
  assert.equal(snapSheetHeight(expanded - 8, -0.61, 600), 'half')
  assert.equal(effectiveSheetSnap('expanded', true), 'collapsed')
  assert.equal(effectiveSheetSnap('expanded', false), 'expanded')
})

test('modal focus wraps at either end but lets interior Tab movement proceed', () => {
  assert.equal(focusTrapTarget(0, 4, true), 3)
  assert.equal(focusTrapTarget(2, 4, true), null)
  assert.equal(focusTrapTarget(3, 4, false), 0)
  assert.equal(focusTrapTarget(1, 4, false), null)
  assert.equal(focusTrapTarget(-1, 4, false), 0)
  assert.equal(focusTrapTarget(0, 0, true), null)
})
