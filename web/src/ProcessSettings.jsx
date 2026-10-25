import React, { useEffect, useRef, useState } from 'react'
import SettingsPanel from 'three-slicer-viewer/components'
import { schema as settingsSchema, uiTree } from 'three-slicer/data'
import { printerTechnology, settingRaw } from 'three-slicer/settings'
import { makeCfg, disabledKeys } from 'three-slicer/toggle'

const panelData = { schema: settingsSchema, uiTree, toggle: { makeCfg, disabledKeys } }

const QUICK_FIELDS = [
  { key: 'layer_height', type: 'coFloat', label: 'Layer height', unit: 'mm', inputMode: 'decimal' },
  { key: 'sparse_infill_density', type: 'coPercent', label: 'Infill', unit: '%', inputMode: 'decimal' },
  { key: 'wall_loops', type: 'coInt', label: 'Walls', unit: '', inputMode: 'numeric' },
]

function validationMessage(result, definition) {
  if (result.reason === 'blank') return 'Enter a value.'
  if (result.reason === 'integer_required') return 'Enter a whole number.'
  if (result.reason === 'below_min') return `Use ${definition.min} or more.`
  if (result.reason === 'above_max') return `Use ${definition.max} or less.`
  return 'Enter a valid number. Use a comma or point for decimals.'
}

function QuickNumberField({ setting, settings, setSettings, overridden, onRevert }) {
  const definition = settingsSchema[setting.key]
  const effectiveValue = settingRaw(settings, setting.key)
  const effectiveText = definition.type === 'coPercent' && typeof effectiveValue === 'string'
    ? effectiveValue.replace(/\s*%$/, '')
    : effectiveValue == null ? '' : String(effectiveValue)
  const [draft, setDraft] = useState(effectiveText)
  const [error, setError] = useState('')
  const focused = useRef(false)
  const errorPresent = useRef(false)
  const committed = useRef(effectiveText)
  const errorId = `quick-setting-error-${setting.key}`

  useEffect(() => {
    if (focused.current || errorPresent.current) return
    setDraft(effectiveText)
    committed.current = effectiveText
  }, [effectiveText])

  function commit() {
    if (draft === committed.current) return
    const parsed = Number(String(draft).replace(',', '.').replace(/\s*%$/, ''))
    const integer = definition.type === 'coInt'
    const result = !draft.trim() || !Number.isFinite(parsed) || (integer && !Number.isInteger(parsed))
      ? { valid: false, reason: !draft.trim() ? 'blank' : integer && Number.isFinite(parsed) && !Number.isInteger(parsed) ? 'integer_required' : 'invalid' }
      : parsed < Number(definition.min) ? { valid: false, reason: 'below_min' }
        : parsed > Number(definition.max) ? { valid: false, reason: 'above_max' } : { valid: true, value: parsed }
    if (!result.valid) {
      errorPresent.current = true
      setError(validationMessage(result, definition))
      return
    }
    const normalized = String(result.value)
    errorPresent.current = false
    committed.current = normalized
    setError('')
    setDraft(normalized)
    setSettings(current => ({ ...current, [setting.key]: result.value }))
  }

  return <div className="quick-setting-field">
    <label className="quick-setting-label" htmlFor={`quick-setting-${setting.key}`}>
      <span>{setting.label}</span>{setting.unit && <span className="quick-setting-unit">{setting.unit}</span>}
    </label>
    <div className="quick-setting-entry">
      <input id={`quick-setting-${setting.key}`} type="text" inputMode={setting.inputMode} value={draft}
        aria-invalid={!!error} aria-describedby={error ? errorId : undefined}
        onFocus={() => { focused.current = true }} onChange={event => {
          setDraft(event.target.value)
          if (errorPresent.current) { errorPresent.current = false; setError('') }
        }}
        onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); commit() } }}
        onBlur={() => { focused.current = false; commit() }} />
      {overridden && <span className="quick-setting-override">Plate override</span>}
    </div>
    {error && <span id={errorId} className="quick-setting-error" role="alert" aria-live="polite">{error}</span>}
    {overridden && <button type="button" className="quick-setting-inherit" onClick={() => {
      errorPresent.current = false
      setError('')
      onRevert?.(setting.key)
    }}
      aria-label={`Use global ${setting.label.toLowerCase()} value`}>Use global value</button>}
  </div>
}

function enabled(value) {
  return value === true || value === 1 || value === '1' || value === 'true'
}

export default function ProcessSettings({ settings, setSettings, scopeMeta }) {
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const fff = printerTechnology(settings) === 'FFF'
  const overriddenKeys = scopeMeta?.overriddenKeys ?? []
  const draftContextKey = `${scopeMeta?.scope ?? 'global'}:${scopeMeta?.selectedPlate ?? 0}`
  const quickFields = QUICK_FIELDS.filter(field => settingsSchema[field.key]?.type === field.type)
  const supportsAvailable = settingsSchema.enable_support?.type === 'coBool'

  return <div className="process-settings">
    {fff && (quickFields.length > 0 || supportsAvailable) && <section className="quick-settings" aria-labelledby="quick-settings-heading">
      <h3 id="quick-settings-heading" className="quick-settings-heading">Quick settings</h3>
      <div className="quick-settings-grid">
        {quickFields.map(setting => <QuickNumberField key={setting.key} setting={setting} settings={settings} setSettings={setSettings}
          overridden={overriddenKeys.includes(setting.key)} onRevert={scopeMeta?.onRevertKey} />)}
        {supportsAvailable && <div className="quick-setting-field quick-support-field">
          <label className="quick-support-toggle">
            <input type="checkbox" checked={enabled(settingRaw(settings, 'enable_support'))}
              onChange={event => setSettings(current => ({ ...current, enable_support: event.target.checked }))} />
            <span>Generate supports</span>
          </label>
          <span className="quick-support-note">Support style and placement are in Advanced settings.</span>
          {overriddenKeys.includes('enable_support') && <button type="button" className="quick-setting-inherit"
            onClick={() => scopeMeta?.onRevertKey?.('enable_support')} aria-label="Use global supports value">Use global value</button>}
        </div>}
      </div>
    </section>}

    <details className="process-advanced" open={advancedOpen} onToggle={event => setAdvancedOpen(event.currentTarget.open)}>
      <summary>Advanced settings</summary>
      <div className="process-advanced-body">
          <SettingsPanel {...panelData} settings={settings} setSettings={setSettings} embedded
          overriddenKeys={scopeMeta?.overriddenKeys} onRevertKey={scopeMeta?.onRevertKey} draftContextKey={draftContextKey} />
      </div>
    </details>
  </div>
}
