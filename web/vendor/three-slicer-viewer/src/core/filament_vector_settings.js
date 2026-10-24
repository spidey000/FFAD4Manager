const VECTOR_NUMERIC_TYPES = new Set(['coFloats', 'coInts', 'coPercents'])
const SCALAR_NUMERIC_TYPES = new Set(['coFloat', 'coInt', 'coPercent'])

const isFiniteNumeric = value => typeof value === 'number' && Number.isFinite(value)
const has = (object, key) => Object.prototype.hasOwnProperty.call(object ?? {}, key)

function materialValue(preset, key) {
  if (!has(preset, key)) return { known: false }
  if (preset[key] === undefined) return { known: false }
  const value = Array.isArray(preset[key]) ? preset[key][0] : preset[key]
  if (value === undefined) return { known: false }
  return { known: true, value }
}

function defaultValue(definition) {
  const raw = definition?.default
  const value = Array.isArray(raw) ? raw[0] : raw
  return isFiniteNumeric(value) ? { known: true, value } : { known: false }
}

function isOwnedNumericKey(key, ownedKeys, settings, preset, schema) {
  if (!ownedKeys.includes(key)) return false
  const type = schema?.[key]?.type
  if (VECTOR_NUMERIC_TYPES.has(type)) return true
  if (!SCALAR_NUMERIC_TYPES.has(type)) return false
  return Array.isArray(settings?.[key]) || Array.isArray(preset?.[key])
}

function slotValue(settings, key, activeIndex) {
  if (!has(settings, key)) return { known: false }
  const raw = settings[key]
  const value = Array.isArray(raw) ? raw[activeIndex] : raw
  return value === undefined ? { known: false } : { known: true, value }
}

/** Project the active filament's numeric columns for a scalar settings panel. */
export function projectFilamentVectorSettings({
  settings = {}, ownedKeys = [], activeIndex, slotCount, preset = {}, schema = {},
}) {
  const validOwner = Number.isInteger(activeIndex) && activeIndex >= 0 && Number.isInteger(slotCount) && activeIndex < slotCount
  const view = { ...settings }
  const editableKeys = []
  const resetValues = {}
  if (!validOwner) return { settings: view, editableKeys, resetValues, validOwner: false }

  for (const key of ownedKeys) {
    if (!isOwnedNumericKey(key, ownedKeys, settings, preset, schema)) continue
    const materialBaseline = materialValue(preset, key)
    const safeDefault = defaultValue(schema[key])
    const baseline = materialBaseline.known ? materialBaseline : safeDefault
    if (baseline.known) resetValues[key] = baseline.value

    const current = slotValue(settings, key, activeIndex)
    // An explicitly null slot means inherit/unset. Only a missing key/slot may display a known baseline.
    if (current.known && current.value === null) {
      view[key] = null
      continue
    }
    const value = current.known ? current.value : (baseline.known ? baseline.value : undefined)
    if (!isFiniteNumeric(value)) continue

    view[key] = value
    editableKeys.push(key)
  }
  return { settings: view, editableKeys, resetValues, validOwner: true }
}

/** Write a scalar panel diff back to just the active filament column. */
export function writeFilamentVectorSettings(previous, before, after, {
  ownedKeys = [], vectorKeys = ownedKeys, activeIndex, slotCount, resetValues = {}, resetOnDelete = true,
} = {}) {
  const validOwner = Number.isInteger(activeIndex) && activeIndex >= 0 && Number.isInteger(slotCount) && activeIndex < slotCount
  if (!validOwner) return previous

  const next = { ...previous }
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])
  for (const key of keys) {
    if (!ownedKeys.includes(key) || !vectorKeys.includes(key) || Object.is(before?.[key], after?.[key])) continue
    if (!has(after, key) && !resetOnDelete) {
      delete next[key]
      continue
    }
    const column = Array.isArray(previous?.[key])
      ? [...previous[key]]
      : Array.from({ length: slotCount }, (_, index) => index === activeIndex ? (previous?.[key] ?? null) : null)

    const value = has(after, key)
      ? after[key]
      : (has(resetValues, key) ? resetValues[key] : null)
    column[activeIndex] = value
    if (column.every(item => item === null)) delete next[key]
    else next[key] = column
  }
  return next
}
