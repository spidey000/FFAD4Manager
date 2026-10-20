import test from 'node:test'
import assert from 'node:assert/strict'
import { deriveResponsiveLayout, effectiveSheetSnap, focusTrapTarget, sheetSnapHeights, snapSheetHeight } from '../src/hooks/use_responsive_layout.js'

test('responsive layout uses container dimensions and scene fit', () => {
  assert.deepEqual(deriveResponsiveLayout(767, 800), { variant: 'compact', short: false })
  assert.deepEqual(deriveResponsiveLayout(768, 800), { variant: 'intermediate', short: false })
  assert.deepEqual(deriveResponsiveLayout(749, 800, 320, 750), { variant: 'compact', short: false })
  assert.deepEqual(deriveResponsiveLayout(750, 800, 320, 750), { variant: 'intermediate', short: false })
  assert.deepEqual(deriveResponsiveLayout(390, 490), { variant: 'compact', short: true })
  assert.deepEqual(deriveResponsiveLayout(959, 900), { variant: 'intermediate', short: false })
  assert.deepEqual(deriveResponsiveLayout(960, 800), { variant: 'expanded', short: false })
  assert.deepEqual(deriveResponsiveLayout(960, 800, 320, 750), { variant: 'expanded', short: false })
  assert.deepEqual(deriveResponsiveLayout(960, 800, 420), { variant: 'intermediate', short: false })
  assert.deepEqual(deriveResponsiveLayout(960, 800, 420, 750), { variant: 'intermediate', short: false })
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

test('sheet stops use the measured action surface and reserve visible scene space when possible', () => {
  const compact = sheetSnapHeights(370, 72)
  assert.deepEqual(compact, { collapsed: 64, half: 118, expanded: 298 })
  assert.equal(370 - 72 - compact.half, 180)
  assert.equal(370 - 72 - compact.expanded, 0)
  assert.equal(snapSheetHeight(70, 0, 370, 72), 'collapsed')
  assert.equal(snapSheetHeight(205, 0, 370, 72), 'half')
  assert.equal(snapSheetHeight(70, 0.61, 370, 72), 'half')
  assert.equal(snapSheetHeight(294, -0.61, 370, 72), 'half')

  const tooShort = sheetSnapHeights(200, 50)
  assert.deepEqual(tooShort, { collapsed: 64, half: 64, expanded: 150 })
})

test('modal focus wraps at either end but lets interior Tab movement proceed', () => {
  assert.equal(focusTrapTarget(0, 4, true), 3)
  assert.equal(focusTrapTarget(2, 4, true), null)
  assert.equal(focusTrapTarget(3, 4, false), 0)
  assert.equal(focusTrapTarget(1, 4, false), null)
  assert.equal(focusTrapTarget(-1, 4, false), 0)
  assert.equal(focusTrapTarget(0, 0, true), null)
})
