import test from 'node:test'
import assert from 'node:assert/strict'
import { deriveResponsiveLayout } from '../src/hooks/use_responsive_layout.js'

test('responsive layout uses container dimensions and scene fit', () => {
  assert.deepEqual(deriveResponsiveLayout(767, 800), { variant: 'compact', short: false })
  assert.deepEqual(deriveResponsiveLayout(390, 490), { variant: 'compact', short: true })
  assert.deepEqual(deriveResponsiveLayout(768, 900), { variant: 'intermediate', short: false })
  assert.deepEqual(deriveResponsiveLayout(959, 900), { variant: 'intermediate', short: false })
  assert.deepEqual(deriveResponsiveLayout(960, 800), { variant: 'expanded', short: false })
  assert.deepEqual(deriveResponsiveLayout(960, 800, 420), { variant: 'intermediate', short: false })
})
