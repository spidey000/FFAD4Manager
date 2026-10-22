import assert from 'node:assert/strict'
import test from 'node:test'
import { parseSchemaSettingDraft, schemaDraftSupport } from '../src/core/schema_setting_draft.js'

test('supports only the scalar schema numeric types', () => {
  for (const type of ['coFloat', 'coInt', 'coPercent', 'coFloatOrPercent']) {
    assert.deepEqual(schemaDraftSupport({ type }), { supported: true })
  }
  assert.deepEqual(schemaDraftSupport({ type: 'coBool' }), { supported: false, reason: 'unsupported_type' })
})

test('parses float decimal comma, dot, and exponent notation', () => {
  const definition = { type: 'coFloat' }
  assert.deepEqual(parseSchemaSettingDraft('0,20', definition), { valid: true, value: 0.2 })
  assert.deepEqual(parseSchemaSettingDraft('0.20', definition), { valid: true, value: 0.2 })
  assert.deepEqual(parseSchemaSettingDraft('-2,5e+2', definition), { valid: true, value: -250 })
})

test('coInt requires integer syntax', () => {
  const definition = { type: 'coInt' }
  assert.deepEqual(parseSchemaSettingDraft('-12', definition), { valid: true, value: -12 })
  assert.deepEqual(parseSchemaSettingDraft('12.0', definition), { valid: false, reason: 'integer_required' })
  assert.deepEqual(parseSchemaSettingDraft('12,0', definition), { valid: false, reason: 'integer_required' })
  assert.deepEqual(parseSchemaSettingDraft('1e2', definition), { valid: false, reason: 'integer_required' })
})

test('coFloatOrPercent keeps percent units and normalizes the numeric text', () => {
  const definition = { type: 'coFloatOrPercent' }
  assert.deepEqual(parseSchemaSettingDraft('0,25%', definition), { valid: true, value: '0.25%' })
  assert.deepEqual(parseSchemaSettingDraft('2.5e1%', definition), { valid: true, value: '25%' })
  assert.deepEqual(parseSchemaSettingDraft('0,25', definition), { valid: true, value: 0.25 })
})

test('enforces inclusive bounds parsed from numbers and C/C++ f-suffixed strings', () => {
  const definition = { type: 'coFloat', min: '0.2f', max: '8e-1F' }
  assert.deepEqual(parseSchemaSettingDraft('0.2', definition), { valid: true, value: 0.2 })
  assert.deepEqual(parseSchemaSettingDraft('0.8', definition), { valid: true, value: 0.8 })
  assert.deepEqual(parseSchemaSettingDraft('0.19', definition), { valid: false, reason: 'below_min' })
  assert.deepEqual(parseSchemaSettingDraft('0.81', definition), { valid: false, reason: 'above_max' })
})

test('applies declared bounds to the numeric component in percent mode', () => {
  const definition = { type: 'coFloatOrPercent', min: 1, max: 10 }
  assert.deepEqual(parseSchemaSettingDraft('1%', definition), { valid: true, value: '1%' })
  assert.deepEqual(parseSchemaSettingDraft('11%', definition), { valid: false, reason: 'above_max' })
  assert.deepEqual(parseSchemaSettingDraft('0', definition), { valid: false, reason: 'below_min' })
})

test('missing bounds are unrestricted', () => {
  assert.deepEqual(schemaDraftSupport({ type: 'coFloat' }), { supported: true })
  assert.deepEqual(parseSchemaSettingDraft('-1e100', { type: 'coFloat' }), { valid: true, value: -1e100 })
})

test('symbolic or otherwise unresolved bounds fail closed', () => {
  for (const bound of ['MAX_VALUE', '1 + 2', '', null, Infinity]) {
    const definition = { type: 'coFloat', max: bound }
    assert.deepEqual(schemaDraftSupport(definition), { supported: false, reason: 'unresolved_bounds' })
    assert.deepEqual(parseSchemaSettingDraft('1', definition), { valid: false, reason: 'unresolved_bounds' })
  }
})

test('rejects blank, malformed, non-finite, and non-text drafts', () => {
  const definition = { type: 'coFloat' }
  assert.deepEqual(parseSchemaSettingDraft('  ', definition), { valid: false, reason: 'blank' })
  assert.deepEqual(parseSchemaSettingDraft('-', definition), { valid: false, reason: 'invalid_number' })
  assert.deepEqual(parseSchemaSettingDraft('1,2.3', definition), { valid: false, reason: 'invalid_number' })
  assert.deepEqual(parseSchemaSettingDraft('Infinity', definition), { valid: false, reason: 'invalid_number' })
  assert.deepEqual(parseSchemaSettingDraft('1e999', definition), { valid: false, reason: 'non_finite' })
  assert.deepEqual(parseSchemaSettingDraft(1, definition), { valid: false, reason: 'invalid_input' })
})

test('rejects unsupported types without mutating definitions', () => {
  const definition = { type: 'coString', min: 0 }
  const before = { ...definition }
  assert.deepEqual(parseSchemaSettingDraft('1', definition), { valid: false, reason: 'unsupported_type' })
  assert.deepEqual(definition, before)
})
