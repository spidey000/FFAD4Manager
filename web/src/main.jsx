import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import Viewport, { useSlicer } from 'three-slicer/viewer'
import FilamentSettingsPanel from './FilamentSettingsPanel.jsx'
import ProcessSettings from './ProcessSettings.jsx'
import { DEFAULT_FILAMENT_COLORS } from '../vendor/three-slicer-viewer/src/core/viewer_defaults.js'
import {
  applyPreset,
  printerSettings,
  processPresets,
  filamentPresets,
} from 'three-slicer/settings'
import './style.css'

const PRINTER = 'Flashforge Adventurer 4 Series 0.4 Nozzle'
const DEFAULT_FILENAME = 'adventurer4_print.gcode'
// Per-instance bridge bearer from index.html; this is not the Cloudflare Access Service Token secret.
const bridgeToken = document.querySelector('meta[name="ffadv4manager-token"]')?.content ?? ''
const defaultPlateFilename = plate => plate === 0 ? DEFAULT_FILENAME : `plate_${plate + 1}.gcode`
const settingsFingerprint = value => JSON.stringify(value, (_key, item) => (
  item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
    : item
))

function App() {
  const [settings, setSettings] = useState(() => printerSettings(PRINTER) ?? {})
  const [plateSettings, setPlateSettings] = useState({})
  const [selectedPlate, setSelectedPlate] = useState(0)
  const selectedPlateRef = useRef(selectedPlate)
  selectedPlateRef.current = selectedPlate
  const [plateCount, setPlateCount] = useState(1)
  const plateCountRef = useRef(plateCount)
  plateCountRef.current = plateCount
  const [sceneRevision, setSceneRevision] = useState(0)
  const sceneRevisionRef = useRef(sceneRevision)
  const [machineMissing, setMachineMissing] = useState(false)
  const [sliceArtifacts, setSliceArtifacts] = useState({})
  const sliceArtifactsRef = useRef(sliceArtifacts)
  sliceArtifactsRef.current = sliceArtifacts
  const [sliceRequest, setSliceRequest] = useState(0)
  const [progress, setProgress] = useState(0)
  const [slicing, setSlicing] = useState(false)
  const [bridgeState, setBridgeState] = useState({ kind: 'idle', text: 'Ready for a sliced file' })

  useEffect(() => {
    const machine = printerSettings(PRINTER)
    if (!machine) {
      setMachineMissing(true)
      return
    }
    Promise.all([processPresets(), filamentPresets()]).then(([processes, filaments]) => {
      const processName = processes.listFor(PRINTER)[0] || ''
      const availableFilaments = filaments.listFor(PRINTER) || []
      const filamentName = (
        availableFilaments.find(item => item.name === 'Generic PLA @Flashforge AD4')
        ?? availableFilaments.find(item => /\bPLA\b/i.test(item.name))
      )?.name || ''
      setSettings(current => {
        let next = applyPreset(current, processes.settingsFor(processName), processes.keys)
        if (filamentName) next = applyPreset(next, filaments.settingsFor(filamentName), filaments.keys)
        next = {
          ...next,
          filament_type: ['PLA'],
          filament_vendor: ['Artillery'],
          filament_flow_ratio: [1.0],
          nozzle_temperature: [210],
          nozzle_temperature_initial_layer: [210],
          hot_plate_temp: [55],
          hot_plate_temp_initial_layer: [55],
        }
        return next
      })
      if (!filamentName) {
        setBridgeState({ kind: 'error', text: 'No PLA material profile is available for this printer. No material preset was applied; add or select a PLA profile before slicing.' })
      }
    }).catch(() => setBridgeState({ kind: 'error', text: 'Preset catalog could not be loaded.' }))
  }, [])

  const currentSettingsFingerprint = settingsFingerprint({ settings, plateSettings })
  const activeArtifact = sliceArtifacts[selectedPlate] ?? null
  const artifactIsCurrent = Boolean(activeArtifact
    && activeArtifact.plate === selectedPlate
    && activeArtifact.settingsFingerprint === currentSettingsFingerprint
    && (activeArtifact.sceneRevision == null || activeArtifact.sceneRevision === sceneRevision)
    && (activeArtifact.layoutPlateCount == null || activeArtifact.layoutPlateCount === plateCount))

  useEffect(() => {
    const stale = Object.values(sliceArtifacts).some(artifact => artifact.settingsFingerprint !== currentSettingsFingerprint
      || (artifact.sceneRevision != null && artifact.sceneRevision !== sceneRevision)
      || (artifact.layoutPlateCount != null && artifact.layoutPlateCount !== plateCount))
    if (stale) {
      setSliceArtifacts(current => {
        const next = Object.fromEntries(Object.entries(current)
          .filter(([, artifact]) => artifact.settingsFingerprint === currentSettingsFingerprint
            && (artifact.sceneRevision == null || artifact.sceneRevision === sceneRevision)
            && (artifact.layoutPlateCount == null || artifact.layoutPlateCount === plateCount)))
        return Object.keys(next).length === Object.keys(current).length ? current : next
      })
    }
    if (activeArtifact && !artifactIsCurrent) {
      setBridgeState({ kind: 'stale', text: 'Plate or settings changed — slice again before sending' })
    }
  }, [activeArtifact, artifactIsCurrent, currentSettingsFingerprint, plateCount, sceneRevision, sliceArtifacts])

  async function sendPrint(start) {
    if (!activeArtifact || !artifactIsCurrent
      || (activeArtifact.sceneRevision != null && activeArtifact.sceneRevision !== sceneRevisionRef.current)
      || (activeArtifact.layoutPlateCount != null && activeArtifact.layoutPlateCount !== plateCountRef.current)) {
      setBridgeState({ kind: 'stale', text: 'Plate or settings changed — slice again before sending' })
      return
    }
    if (start && !window.confirm(`Upload “${activeArtifact.filename}” and start printing on the Adventurer 4?`)) return
    setBridgeState({ kind: 'working', text: start ? 'Uploading and starting…' : 'Uploading file…' })
    try {
      const response = await fetch('/api/print', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bridgeToken}` },
        body: JSON.stringify({ filename: activeArtifact.filename, gcode: activeArtifact.gcode, start }),
      })
      const contentType = response.headers.get('content-type') || ''
      if (response.redirected || !contentType.toLowerCase().includes('json')) {
        setBridgeState({ kind: 'error', text: 'Your Access session is missing or expired. Sign in through the Access page, then try again.' })
        return
      }
      let result
      try {
        result = await response.json()
      } catch {
        setBridgeState({ kind: 'error', text: 'Your Access session is missing or expired. Sign in through the Access page, then try again.' })
        return
      }
      setBridgeState(result.success
        ? { kind: 'success', text: result.message || 'The file was sent to the printer bridge.' }
        : { kind: 'error', text: result.error || `The printer bridge rejected the request (${response.status}).` })
    } catch {
      setBridgeState({ kind: 'error', text: 'Could not reach the local printer bridge.' })
    }
  }

  return <main className="station-shell">
    <header className="topbar">
      <a className="brand" href="#top" aria-label="AD4 Print Station home"><span className="brand-mark">A4</span><span>PRINT<span className="brand-light"> / STATION</span></span></a>
      <div className="top-right"><span className="live-dot" /> LOCAL WORKSTATION <span className="top-divider" /> BUILD 01</div>
    </header>

    <section className="workspace" aria-label="Model preparation workspace">
      <div className="workspace-heading"><div><span className="eyebrow">MODEL / TOOLPATH</span><h2>Work surface</h2></div><div className="workspace-hint"><span className="crosshair">＋</span> Drop a model or use the viewer’s open control</div></div>
      {machineMissing && <div className="profile-warning" role="alert">The bundled Adventurer 4 machine profile is missing. Slicing is unavailable until a compatible bundled profile is available.</div>}
      <div className="viewport-frame"><Viewport
        settings={settings}
        setSettings={setSettings}
        plateSettings={plateSettings}
        setPlateSettings={setPlateSettings}
        defaultExtruderColors={DEFAULT_FILAMENT_COLORS.slice(0, 1)}
        processPanel={(effectiveSettings, scopedSetSettings, scopeMeta) => <ProcessSettings
          settings={effectiveSettings} setSettings={scopedSetSettings} scopeMeta={scopeMeta} />}
        filamentPanel={(projectedSettings, setPanelSettings, ownerMeta) => <FilamentSettingsPanel
          settings={projectedSettings} setSettings={setPanelSettings} ownerMeta={ownerMeta} />}
        defaultAutoSlice={false}
        slicer={useSlicer}
        sliceRequest={sliceRequest || null}
        onSliced={({ gcode: result, plate, snapshot }) => {
          if (plate >= plateCountRef.current) return
          setSliceArtifacts(current => ({
            ...current,
            [plate]: {
              gcode: result,
              plate,
              settingsFingerprint: snapshot
                ? settingsFingerprint({ settings: snapshot.settings, plateSettings: snapshot.plateSettings })
                : currentSettingsFingerprint,
              sceneRevision: snapshot?.sceneRevision ?? null,
              layoutPlateCount: snapshot?.layout?.plateCount ?? null,
              filename: current[plate]?.filename ?? defaultPlateFilename(plate),
            },
          }))
          if (plate === selectedPlateRef.current) {
            const fresh = (snapshot?.sceneRevision == null || snapshot.sceneRevision === sceneRevisionRef.current)
              && (snapshot?.layout?.plateCount == null || snapshot.layout.plateCount === plateCountRef.current)
            setBridgeState(fresh
              ? { kind: 'ready', text: `Plate ${plate + 1} slice complete — review before sending` }
              : { kind: 'stale', text: 'Model or paint changed — slice again before sending' })
          }
        }}
        onEvent={event => {
          if (event.type === 'selectedPlate') {
            setSelectedPlate(event.value)
            const artifact = sliceArtifacts[event.value]
            if (!artifact) setBridgeState({ kind: 'idle', text: `No slice for Plate ${event.value + 1}` })
            else if (artifact.settingsFingerprint === currentSettingsFingerprint
              && (artifact.sceneRevision == null || artifact.sceneRevision === sceneRevisionRef.current)
              && (artifact.layoutPlateCount == null || artifact.layoutPlateCount === plateCountRef.current)) {
              setBridgeState({ kind: 'ready', text: `Plate ${event.value + 1} slice complete — review before sending` })
            } else setBridgeState({ kind: 'stale', text: 'Plate or settings changed — slice again before sending' })
          }
          if (event.type === 'plateCount') {
            const previousCount = plateCountRef.current
            const nextCount = Math.max(1, Number(event.value) || 1)
            plateCountRef.current = nextCount
            setPlateCount(nextCount)
            if (nextCount < previousCount) {
              setSliceArtifacts(current => {
                const next = Object.fromEntries(Object.entries(current)
                  .filter(([index]) => Number(index) < nextCount))
                return Object.keys(next).length === Object.keys(current).length ? current : next
              })
            }
          }
          if (event.type === 'sceneRevision') {
            const revision = Number(event.value) || 0
            sceneRevisionRef.current = revision
            setSceneRevision(revision)
            // A revision with nothing sliced is just a newer scene, not a stale warning. Once an artifact exists,
            // the change makes it unusable: clear it at this boundary so no render can offer it for sending.
            if (Object.keys(sliceArtifactsRef.current).length) {
              sliceArtifactsRef.current = {}
              setSliceArtifacts({})
              setBridgeState({ kind: 'stale', text: 'Model or paint changed — slice again before sending' })
            }
          }
          if (event.type === 'slicing') setSlicing(event.value)
          if (event.type === 'progress') setProgress(Math.round(event.value * 100))
          if (event.type === 'error') setBridgeState({ kind: 'error', text: event.value })
        }}
        onExport={(file, name, provenance) => {
          if (name.toLowerCase().endsWith('.gcode')) {
            const plate = provenance?.plate ?? selectedPlateRef.current
            if (plate >= plateCountRef.current) return true
            const fingerprint = provenance?.snapshot
              ? settingsFingerprint({ settings: provenance.snapshot.settings, plateSettings: provenance.snapshot.plateSettings })
              : currentSettingsFingerprint
            const exportRevision = provenance?.snapshot?.sceneRevision ?? null
            const layoutPlateCount = provenance?.snapshot?.layout?.plateCount ?? null
            file.text().then(text => {
              setSliceArtifacts(current => ({
                ...current,
                [plate]: { gcode: text, plate, settingsFingerprint: fingerprint, sceneRevision: exportRevision, layoutPlateCount, filename: name },
              }))
              if (plate === selectedPlateRef.current) {
                const fresh = (exportRevision == null || exportRevision === sceneRevisionRef.current)
                  && (layoutPlateCount == null || layoutPlateCount === plateCountRef.current)
                setBridgeState(fresh
                  ? { kind: 'ready', text: `Plate ${plate + 1} G-code ready — review before sending` }
                  : { kind: 'stale', text: 'Model or paint changed — slice again before sending' })
              }
            })
            return true
          }
          return false
        }}
      /></div>
      <div className="work-send" aria-label="Send sliced file to printer">
        <div className="work-send-status" role="status" aria-live="polite">
          <span className={`status-led ${bridgeState.kind}`} />
          <span>{bridgeState.text}</span>
        </div>
        {slicing && <div className="work-progress" aria-label={`Slicing ${progress}%`}><span style={{ width: `${progress}%` }} /></div>}
        <div className="work-send-actions">
          {activeArtifact && artifactIsCurrent && <label className="work-filename">
            <span>G-CODE FILE</span>
            <input value={activeArtifact.filename} onChange={event => setSliceArtifacts(current => ({
              ...current,
              [selectedPlate]: { ...current[selectedPlate], filename: event.target.value },
            }))} aria-label="G-code filename" />
          </label>}
          <div className="work-send-buttons">
            <button className="button button-secondary" onClick={() => sendPrint(false)} disabled={!artifactIsCurrent || slicing || machineMissing}>UPLOAD FILE <span>↗</span></button>
            <button className="button button-primary" onClick={() => sendPrint(true)} disabled={!artifactIsCurrent || slicing || machineMissing}>UPLOAD + START <span>→</span></button>
          </div>
        </div>
      </div>
    </section>

    <footer><span>AD4 PRINT STATION <span className="footer-dot">/</span> LOCAL ONLY</span><span>220 × 200 × 250 MM <span className="footer-dot">/</span> 0.4 MM NOZZLE</span></footer>
  </main>
}

createRoot(document.getElementById('root')).render(<App />)
