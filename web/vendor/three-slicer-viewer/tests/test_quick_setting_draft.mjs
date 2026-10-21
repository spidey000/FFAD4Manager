import assert from 'node:assert/strict'
import test from 'node:test'
import { validateQuickSettingDraft } from '../src/core/quick_setting_draft.js'

test('float and percent drafts accept comma or dot as the decimal separator', () => {
  const definition = { type: 'coFloat' }
  assert.deepEqual(validateQuickSettingDraft('0,20', definition), { valid: true, value: 0.2 })
  assert.deepEqual(validateQuickSettingDraft('0.20', definition), { valid: true, value: 0.2 })
})

test('percent values stay in the schema numeric representation', () => {
  assert.deepEqual(validateQuickSettingDraft('0,20', { type: 'coPercent' }), { valid: true, value: 0.2 })
})

test('rejects blank, partial, mixed-separator, and non-finite inputs', () => {
  const definition = { type: 'coFloat' }
  assert.deepEqual(validateQuickSettingDraft('  ', definition), { valid: false, reason: 'blank' })
  assert.deepEqual(validateQuickSettingDraft('-', definition), { valid: false, reason: 'invalid_number' })
  assert.deepEqual(validateQuickSettingDraft('1,2.3', definition), { valid: false, reason: 'invalid_number' })
  assert.deepEqual(validateQuickSettingDraft('Infinity', definition), { valid: false, reason: 'invalid_number' })
  assert.deepEqual(validateQuickSettingDraft('1e999', definition), { valid: false, reason: 'non_finite' })
})

test('coInt requires integral syntax and value', () => {
  const definition = { type: 'coInt' }
  assert.deepEqual(validateQuickSettingDraft('12', definition), { valid: true, value: 12 })
  assert.deepEqual(validateQuickSettingDraft('12.0', definition), { valid: false, reason: 'integer_required' })
  assert.deepEqual(validateQuickSettingDraft('12,0', definition), { valid: false, reason: 'integer_required' })
})

test('enforces inclusive schema min/max bounds', () => {
  const definition = { type: 'coFloat', min: 0.2, max: 0.8 }
  assert.deepEqual(validateQuickSettingDraft('0,2', definition), { valid: true, value: 0.2 })
  assert.deepEqual(validateQuickSettingDraft('0.8', definition), { valid: true, value: 0.8 })
  assert.deepEqual(validateQuickSettingDraft('0.19', definition), { valid: false, reason: 'below_min' })
  assert.deepEqual(validateQuickSettingDraft('0.81', definition), { valid: false, reason: 'above_max' })
})

test('rejects unsupported and non-text input', () => {
  assert.deepEqual(validateQuickSettingDraft('1', { type: 'coBool' }), { valid: false, reason: 'unsupported_type' })
  assert.deepEqual(validateQuickSettingDraft(1, { type: 'coFloat' }), { valid: false, reason: 'invalid_input' })
})
