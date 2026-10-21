const NUMERIC_TYPES = new Set(['coFloat', 'coPercent', 'coInt'])
const FLOAT_PATTERN = /^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:[eE][+-]?\d+)?$/
const INTEGER_PATTERN = /^[+-]?\d+$/

export function validateQuickSettingDraft(rawValue, definition) {
  if (!NUMERIC_TYPES.has(definition?.type)) return { valid: false, reason: 'unsupported_type' }
  if (typeof rawValue !== 'string') return { valid: false, reason: 'invalid_input' }

  const draft = rawValue.trim()
  if (!draft) return { valid: false, reason: 'blank' }

  const isInteger = definition.type === 'coInt'
  const pattern = isInteger ? INTEGER_PATTERN : FLOAT_PATTERN
  if (!pattern.test(draft)) return { valid: false, reason: isInteger ? 'integer_required' : 'invalid_number' }

  const value = Number(isInteger ? draft : draft.replace(',', '.'))
  if (!Number.isFinite(value)) return { valid: false, reason: 'non_finite' }
  if (isInteger && !Number.isInteger(value)) return { valid: false, reason: 'integer_required' }
  if (definition.min !== undefined && value < definition.min) return { valid: false, reason: 'below_min' }
  if (definition.max !== undefined && value > definition.max) return { valid: false, reason: 'above_max' }

  return { valid: true, value }
}
