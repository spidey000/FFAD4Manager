// The status line's exact wording, split from the scene so the variants are testable without a renderer.
import assert from 'node:assert'
import { sceneStatus } from '../src/scene/status_text.js'

const base = { count: 1, selectedCount: 0, selectedName: null, hoveredName: null, shortcuts: true }
assert.strictEqual(sceneStatus(base),
  '1 object(s) · selected: — | M/R/S · Ctrl+click to add · Shift+drag to box-select · ? for shortcuts')
assert.strictEqual(sceneStatus({ ...base, compact: true }), '1 object(s) · selected: —')
assert.strictEqual(sceneStatus({ ...base, selectedCount: 1, selectedName: 'cube.3mf' }),
  '1 object(s) · selected: cube.3mf | M/R/S · Ctrl+click to add · Shift+drag to box-select · ? for shortcuts')
assert.strictEqual(sceneStatus({ ...base, compact: true, selectedCount: 2 }), '1 object(s) · selected: 2 objects')
assert.strictEqual(sceneStatus({ ...base, selectedCount: 3 }),
  '1 object(s) · selected: 3 objects | M/R/S · Ctrl+click to add · Shift+drag to box-select · ? for shortcuts')
assert.strictEqual(sceneStatus({ ...base, shortcuts: false }),
  '1 object(s) · selected: — | Ctrl+click to add · Shift+drag to box-select')
assert.strictEqual(sceneStatus({ ...base, count: 0, hoveredName: 'cube.3mf' }),
  'hover: cube.3mf · selected: — | left-drag to orbit · ? for shortcuts')
assert.strictEqual(sceneStatus({ ...base, count: 0, shortcuts: false }),
  'hover: — · selected: — | left-drag to orbit')
assert.strictEqual(sceneStatus({ ...base, count: 0, compact: true }), 'hover: — · selected: —')
console.log('status_text: ok')
