import React from 'react'
import SettingsPanel from 'three-slicer-viewer/components'
import { schema as fullSchema, uiTree as fullUiTree } from 'three-slicer/data'
import { makeCfg, disabledKeys } from 'three-slicer/toggle'

const FILAMENT_BUILDERS = ['TabFilament::build', 'TabFilament::add_filament_overrides_page']

function collectFilamentTree() {
  const keys = new Set()
  const pages = FILAMENT_BUILDERS.flatMap(builder => fullUiTree[builder] ?? []).map(page => ({
    ...page,
    groups: page.groups.map(group => ({
      ...group,
      options: group.options.filter(key => {
        const available = !key.startsWith('<') && Object.prototype.hasOwnProperty.call(fullSchema, key)
        if (available) keys.add(key)
        return available
      }),
    })).filter(group => group.options.length > 0),
  })).filter(page => page.groups.length > 0)
  return {
    tree: { Filament: pages },
    schema: Object.fromEntries([...keys].map(key => [key, fullSchema[key]])),
    keys,
  }
}

const FILAMENT_DATA = collectFilamentTree()
const panelData = { schema: FILAMENT_DATA.schema, uiTree: FILAMENT_DATA.tree, toggle: { makeCfg, disabledKeys } }
const has = (object, key) => Object.prototype.hasOwnProperty.call(object ?? {}, key)

function ownerForPanel(projectedSettings, ownerMeta) {
  const validSlot = Number.isInteger(ownerMeta?.activeIndex) && ownerMeta.activeIndex >= 0
    && Number.isInteger(ownerMeta?.slotCount) && ownerMeta.activeIndex < ownerMeta.slotCount
  const resetValues = validSlot ? Object.fromEntries(Object.entries(ownerMeta.resetValues ?? {})
    .filter(([key, value]) => FILAMENT_DATA.keys.has(key) && Number.isFinite(value))) : {}
  const editableKeys = validSlot ? (ownerMeta.editableKeys ?? []).filter(key => {
    return FILAMENT_DATA.keys.has(key) && has(resetValues, key) && projectedSettings?.[key] !== null
  }) : []
  return {
    scope: ownerMeta?.scope ?? 'global',
    selectedPlate: ownerMeta?.selectedPlate ?? 0,
    activeIndex: ownerMeta?.activeIndex,
    slotCount: ownerMeta?.slotCount,
    editableKeys,
    resetValues,
    overriddenKeys: (ownerMeta?.overriddenKeys ?? []).filter(key => FILAMENT_DATA.keys.has(key)),
    onRevertKey: ownerMeta?.onRevertKey,
    contextKey: ownerMeta?.contextKey ?? 'filament:inactive',
  }
}

export default function FilamentSettingsPanel({ settings, setSettings, ownerMeta }) {
  const vectorOwner = ownerForPanel(settings, ownerMeta)
  const activeSlot = Number.isInteger(ownerMeta?.activeIndex) ? ownerMeta.activeIndex + 1 : null
  return <div className="filament-settings-panel" data-testid="filament-advanced-settings" data-filament-slot={ownerMeta?.activeIndex ?? ''}>
    {activeSlot && <div className="sc-info"><span>Advanced for</span><strong>T{activeSlot}</strong></div>}
    <p className="sc-note">T rows are logical filament slots, not physical nozzles.</p>
    <SettingsPanel {...panelData} settings={settings}
      setSettings={setSettings} embedded overriddenKeys={vectorOwner.overriddenKeys} onRevertKey={vectorOwner.onRevertKey} />
  </div>
}
