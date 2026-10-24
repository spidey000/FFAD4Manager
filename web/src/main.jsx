import React, { useEffect, useMemo, useRef, useState } from 'react'
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
const defaultPlateFilename = plate => plate === 0 ? DEFAULT_FILENAME : `plate_${plate + 1}.gcode`
const token = document.querySelector('meta[name="ffadv4manager-token"]')?.content ?? ''
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
  const [catalogs, setCatalogs] = useState({ processes: null, filaments: null })
  const [preset, setPreset] = useState('')
  const [material, setMaterial] = useState('')
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
      setCatalogs({ processes, filaments })
      const processName = processes.listFor(PRINTER)[0] || ''
      const filamentName = filaments.recommendedFor(PRINTER)[0]?.name || filaments.listFor(PRINTER)[0]?.name || ''
      setPreset(processName)
      setMaterial(filamentName)
      setSettings(current => {
        let next = applyPreset(current, processes.settingsFor(processName), processes.keys)
        next = applyPreset(next, filaments.settingsFor(filamentName), filaments.keys)
        return next
      })
    }).catch(() => setBridgeState({ kind: 'error', text: 'Preset catalog could not be loaded.' }))
  }, [])

  const processNames = useMemo(() => catalogs.processes?.listFor(PRINTER) ?? [], [catalogs.processes])
  const filamentNames = useMemo(() => catalogs.filaments?.listFor(PRINTER).map(item => item.name) ?? [], [catalogs.filaments])
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

  function chooseProcess(name) {
    setPreset(name)
    const profile = catalogs.processes?.settingsFor(name)
    if (profile) setSettings(current => applyPreset(current, profile, catalogs.processes.keys))
  }

  function chooseMaterial(name) {
    setMaterial(name)
    const profile = catalogs.filaments?.settingsFor(name)
    if (profile) setSettings(current => applyPreset(current, profile, catalogs.filaments.keys))
  }

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
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ filename: activeArtifact.filename, gcode: activeArtifact.gcode, start }),
      })
      const result = await response.json()
      setBridgeState(result.success
        ? { kind: 'success', text: result.message }
        : { kind: 'error', text: result.error || 'The printer bridge rejected the request.' })
    } catch {
      setBridgeState({ kind: 'error', text: 'Could not reach the local printer bridge.' })
    }
  }

  return <main className="station-shell">
    <header className="topbar">
      <a className="brand" href="#top" aria-label="AD4 Print Station home"><span className="brand-mark">A4</span><span>PRINT<span className="brand-light"> / STATION</span></span></a>
      <div className="top-right"><span className="live-dot" /> LOCAL WORKSTATION <span className="top-divider" /> BUILD 01</div>
    </header>

    <section className="intro" id="top">
      <div className="intro-copy">
        <p className="eyebrow"><span>01</span> DESKTOP FABRICATION</p>
        <h1>Make it<br /><em>physical.</em></h1>
        <p className="intro-note">Prepare a model, tune the job, then send it to your Adventurer 4. Nothing leaves this workstation until you choose.</p>
      </div>
      <div className="machine-card" aria-label="Selected printer: Flashforge Adventurer 4">
        <div className="machine-head"><span className="small-label">CONNECTED PROFILE</span><span className="connection"><i /> LOCAL</span></div>
        <div className="machine-art" aria-hidden="true">
          <div className="printer-frame"><div className="printer-top"/><div className="printer-back"/><div className="printer-side"/><div className="printer-window"><span className="print-bed"/><span className="print-head"/><span className="print-model"/></div><div className="printer-base"><span>FLASHFORGE</span></div></div>
          <span className="dimension dimension-x">220 mm</span><span className="dimension dimension-y">200 mm</span><span className="dimension dimension-z">250 mm</span>
        </div>
        <div className="machine-foot"><div><strong>Adventurer 4</strong><span>Single nozzle · 0.4 mm</span></div><span className="machine-index">FF / 04</span></div>
      </div>
    </section>

    <section className="control-strip" aria-label="Print profile settings">
      <div className="strip-title"><span className="strip-number">02</span><span>JOB SETUP</span></div>
      <label className="setting-select"><span>PROCESS</span><select value={preset} onChange={event => chooseProcess(event.target.value)} disabled={!processNames.length}><option value="">Loading profiles…</option>{processNames.map(name => <option key={name}>{name}</option>)}</select></label>
      <label className="setting-select"><span>MATERIAL</span><select value={material} onChange={event => chooseMaterial(event.target.value)} disabled={!filamentNames.length}><option value="">Loading materials…</option>{filamentNames.map(name => <option key={name}>{name}</option>)}</select></label>
      <div className="strip-dimensions"><span>BUILD VOLUME</span><strong>220 <b>×</b> 200 <b>×</b> 250 <small>mm</small></strong></div>
    </section>

    <section className="workspace" aria-label="Model preparation workspace">
      <div className="workspace-heading"><div><span className="eyebrow"><span>03</span> MODEL / TOOLPATH</span><h2>Work surface</h2></div><div className="workspace-hint"><span className="crosshair">＋</span> Drop a model or use the viewer’s open control</div></div>
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
    </section>

    <section className="send-panel" aria-label="Send print to Adventurer 4">
      <div className="send-intro"><span className="eyebrow"><span>04</span> SEND TO PRINTER</span><h2>Ready when<br />you are.</h2><p>Slicing never starts a printer. Check the result, then choose how to send it.</p></div>
      <div className="send-actions">
        <div className="send-status" role="status" aria-live="polite"><span className={`status-led ${bridgeState.kind}`} />{bridgeState.text}</div>
        {slicing && <div className="progress-line" aria-label={`Slicing ${progress}%`}><span style={{ width: `${progress}%` }} /></div>}
        {activeArtifact && artifactIsCurrent && <label className="filename-field"><span>G-CODE FILE</span><input value={activeArtifact.filename} onChange={event => setSliceArtifacts(current => ({
          ...current,
          [selectedPlate]: { ...current[selectedPlate], filename: event.target.value },
        }))} aria-label="G-code filename" /></label>}
        <div className="buttons"><button className="button button-secondary" onClick={() => sendPrint(false)} disabled={!artifactIsCurrent || slicing}>UPLOAD FILE <span>↗</span></button><button className="button button-primary" onClick={() => sendPrint(true)} disabled={!artifactIsCurrent || slicing}>UPLOAD + START <span>→</span></button></div>
        <p className="send-footnote">START asks for confirmation before the printer receives a start command.</p>
      </div>
    </section>
    <footer><span>AD4 PRINT STATION <span className="footer-dot">/</span> LOCAL ONLY</span><span>220 × 200 × 250 MM <span className="footer-dot">/</span> 0.4 MM NOZZLE</span></footer>
  </main>
}

createRoot(document.getElementById('root')).render(<App />)
