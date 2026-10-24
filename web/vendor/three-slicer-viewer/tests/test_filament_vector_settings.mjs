import assert from 'node:assert/strict'
import test from 'node:test'
import { projectFilamentVectorSettings, writeFilamentVectorSettings } from '../src/core/filament_vector_settings.js'

const schema = {
  temp: { type: 'coFloats', default: [200] },
  flow: { type: 'coFloat', default: 1 },
  ratio: { type: 'coPercents', default: [-1] },
  no_default: { type: 'coInts', default: null },
  label: { type: 'coStrings', default: ['x'] },
}
const ownedKeys = Object.keys(schema)

test('projects selected numeric column values and does not scalarize non-numeric owned keys', () => {
  const result = projectFilamentVectorSettings({
    settings: { temp: [200, 215, 230], flow: [0.8, 0.9, 1], ratio: [null, -1, 4], label: ['a', 'b', 'c'] },
    ownedKeys, activeIndex: 1, slotCount: 3, preset: { temp: [205] }, schema,
  })
  assert.equal(result.settings.temp, 215)
  assert.equal(result.settings.flow, 0.9)
  assert.equal(result.settings.ratio, -1)
  assert.deepEqual(result.settings.label, ['a', 'b', 'c'])
  assert.deepEqual(result.editableKeys, ['temp', 'flow', 'ratio'])
})

test('uses selected preset or safe schema default when the active slot is absent', () => {
  const result = projectFilamentVectorSettings({
    settings: { temp: [], flow: [] }, ownedKeys, activeIndex: 0, slotCount: 1,
    preset: { temp: [218] }, schema,
  })
  assert.equal(result.settings.temp, 218)
  assert.equal(result.settings.flow, 1)
  assert.equal(result.settings.ratio, -1)
  assert.deepEqual(result.editableKeys, ['temp', 'flow', 'ratio'])
})

test('explicit null slots stay null and non-editable despite preset/default baselines', () => {
  const settings = { temp: [null, 210, 230, 240], flow: [null], ratio: [null, -1, 4] }
  const result = projectFilamentVectorSettings({
    settings, ownedKeys, activeIndex: 0, slotCount: 1,
    preset: { temp: [218], flow: [0.95], ratio: [-1], no_default: [null] }, schema,
  })
  assert.equal(result.settings.temp, null)
  assert.equal(result.settings.flow, null)
  assert.equal(result.settings.ratio, null)
  assert.deepEqual(result.editableKeys, [])
  assert.equal(result.resetValues.temp, 218)
  assert.equal(result.resetValues.flow, 0.95)
  assert.equal(result.resetValues.ratio, -1)
  assert.equal('no_default' in result.resetValues, true)
  assert.equal(result.resetValues.no_default, null)
  assert.deepEqual(settings, { temp: [null, 210, 230, 240], flow: [null], ratio: [null, -1, 4] })
})

test('does not make nil values editable without a real preset or numeric default', () => {
  const result = projectFilamentVectorSettings({
    settings: { no_default: [null] }, ownedKeys, activeIndex: 0, slotCount: 1, schema,
  })
  assert.equal(result.editableKeys.includes('no_default'), false)
  assert.equal('no_default' in result.resetValues, false)
})

test('writes count-one edits as arrays', () => {
  const previous = { temp: [200] }
  const result = writeFilamentVectorSettings(previous, { temp: 200 }, { temp: 210 }, {
    ownedKeys, activeIndex: 0, slotCount: 1,
  })
  assert.deepEqual(result, { temp: [210] })
})

test('updates T1, T2, or T3 while preserving siblings and vendor tails', () => {
  const previous = { temp: [100, 200, 300, 400, null], ratio: [0.9, 1, -1, 1.2] }
  for (const activeIndex of [0, 1, 2]) {
    const result = writeFilamentVectorSettings(previous, { temp: previous.temp[activeIndex] }, { temp: 250 }, {
      ownedKeys, activeIndex, slotCount: 3,
    })
    const expected = [...previous.temp]
    expected[activeIndex] = 250
    assert.deepEqual(result.temp, expected)
    assert.deepEqual(result.ratio, previous.ratio)
  }
})

test('reset restores preset/default baselines, preserving explicit null and sentinel values', () => {
  const previous = { temp: [180, 220, 230], ratio: [0.8, 0.9, 1] }
  const resetValues = { temp: 205, ratio: -1, no_default: null }
  const reset = writeFilamentVectorSettings(previous, { temp: 220 }, {}, {
    ownedKeys, activeIndex: 1, slotCount: 3, resetValues,
  })
  assert.deepEqual(reset.temp, [180, 205, 230])
  const sentinel = writeFilamentVectorSettings(previous, { ratio: 0.9 }, {}, {
    ownedKeys, activeIndex: 1, slotCount: 3, resetValues,
  })
  assert.deepEqual(sentinel.ratio, [0.8, -1, 1])
  const explicitNull = writeFilamentVectorSettings({ no_default: [1] }, { no_default: 1 }, {}, {
    ownedKeys, activeIndex: 0, slotCount: 1, resetValues,
  })
  assert.deepEqual(explicitNull, {})
})

test('deletes a key only when the resulting full vector is all null', () => {
  const result = writeFilamentVectorSettings({ temp: [null, null, null] }, { temp: 1 }, {}, {
    ownedKeys, activeIndex: 0, slotCount: 3,
  })
  assert.deepEqual(result, {})
  const withSentinel = writeFilamentVectorSettings({ temp: [null, -1, null] }, { temp: null }, { temp: 2 }, {
    ownedKeys, activeIndex: 0, slotCount: 3,
  })
  assert.deepEqual(withSentinel.temp, [2, -1, null])
})

test('rejects out-of-range owners without projection or writes', () => {
  const previous = { temp: [200, 210] }
  const projection = projectFilamentVectorSettings({ settings: previous, ownedKeys, activeIndex: 2, slotCount: 2, schema })
  assert.equal(projection.validOwner, false)
  assert.deepEqual(projection.settings.temp, [200, 210])
  assert.equal(projection.editableKeys.length, 0)
  assert.equal(writeFilamentVectorSettings(previous, { temp: 210 }, { temp: 220 }, {
    ownedKeys, activeIndex: 2, slotCount: 2,
  }), previous)
})

test('leaves inputs and nested source columns unchanged', () => {
  const previous = { temp: [180, 220, 240] }
  const before = { temp: 220 }
  const after = { temp: 225 }
  const originalColumn = [...previous.temp]
  const projected = projectFilamentVectorSettings({ settings: previous, ownedKeys, activeIndex: 1, slotCount: 3, schema })
  const written = writeFilamentVectorSettings(previous, before, after, { ownedKeys, activeIndex: 1, slotCount: 3 })
  assert.deepEqual(previous.temp, originalColumn)
  assert.deepEqual(before, { temp: 220 })
  assert.deepEqual(after, { temp: 225 })
  assert.deepEqual(projected.settings.temp, 220)
  assert.deepEqual(written.temp, [180, 225, 240])
})
