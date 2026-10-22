const NUMERIC_TYPES = new Set(['coFloat', 'coInt', 'coPercent', 'coFloatOrPercent'])
const FLOAT_PATTERN = /^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:[eE][+-]?\d+)?$/
const INTEGER_PATTERN = /^[+-]?\d+$/
const BOUND_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?[fF]?$/

function resolveBound(definition, name) {
  const raw = definition?.[name]
  if (raw === undefined) return { resolved: true, present: false }
  if (typeof raw === 'number') {
    return Number.isFinite(raw)
      ? { resolved: true, present: true, value: raw }
      : { resolved: false }
  }
  if (typeof raw !== 'string') return { resolved: false }

  const text = raw.trim()
  if (!BOUND_PATTERN.test(text)) return { resolved: false }
  const value = Number(text.replace(/[fF]$/, ''))
  return Number.isFinite(value)
    ? { resolved: true, present: true, value }
    : { resolved: false }
}

function inspectDefinition(definition) {
  if (!NUMERIC_TYPES.has(definition?.type)) return { supported: false, reason: 'unsupported_type' }
  const min = resolveBound(definition, 'min')
  const max = resolveBound(definition, 'max')
  if (!min.resolved || !max.resolved) return { supported: false, reason: 'unresolved_bounds' }
  return { supported: true, min, max }
}

export function schemaDraftSupport(definition) {
  const support = inspectDefinition(definition)
  return support.supported
    ? { supported: true }
    : { supported: false, reason: support.reason }
}

export function parseSchemaSettingDraft(raw, definition) {
  const inspected = inspectDefinition(definition)
  if (!inspected.supported) return { valid: false, reason: inspected.reason }
  if (typeof raw !== 'string') return { valid: false, reason: 'invalid_input' }

  let draft = raw.trim()
  if (!draft) return { valid: false, reason: 'blank' }

  const isPercentUnit = definition.type === 'coFloatOrPercent' && draft.endsWith('%')
  if (isPercentUnit) draft = draft.slice(0, -1).trim()

  const isInteger = definition.type === 'coInt'
  const pattern = isInteger ? INTEGER_PATTERN : FLOAT_PATTERN
  if (!pattern.test(draft)) return { valid: false, reason: isInteger ? 'integer_required' : 'invalid_number' }

  const numeric = Number(isInteger ? draft : draft.replace(',', '.'))
  if (!Number.isFinite(numeric)) return { valid: false, reason: 'non_finite' }
  if (isInteger && !Number.isInteger(numeric)) return { valid: false, reason: 'integer_required' }
  if (inspected.min.present && numeric < inspected.min.value) return { valid: false, reason: 'below_min' }
  if (inspected.max.present && numeric > inspected.max.value) return { valid: false, reason: 'above_max' }

  return { valid: true, value: isPercentUnit ? `${numeric}%` : numeric }
}
