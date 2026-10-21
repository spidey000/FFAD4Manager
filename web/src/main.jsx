import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import Viewport, { useSlicer } from 'three-slicer/viewer'
import ProcessSettings from './ProcessSettings.jsx'
import {
  applyPreset,
  printerSettings,
  processPresets,
  filamentPresets,
} from 'three-slicer/settings'
import './style.css'

const PRINTER = 'Flashforge Adventurer 4 Series 0.4 Nozzle'
const token = document.querySelector('meta[name="ffadv4manager-token"]')?.content ?? ''
const settingsFingerprint = value => JSON.stringify(value, (_key, item) => (
  item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
    : item
))

function App() {
  const [settings, setSettings] = useState(() => printerSettings(PRINTER) ?? {})
  const [catalogs, setCatalogs] = useState({ processes: null, filaments: null })
  const [preset, setPreset] = useState('')
  const [material, setMaterial] = useState('')
  const [machineMissing, setMachineMissing] = useState(false)
  const [sliceArtifact, setSliceArtifact] = useState(null)
  const [filename, setFilename] = useState('adventurer4_print.gcode')
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
  const currentSettingsFingerprint = settingsFingerprint(settings)
  const artifactIsCurrent = Boolean(sliceArtifact && sliceArtifact.settingsFingerprint === currentSettingsFingerprint)

  useEffect(() => {
    if (sliceArtifact && !artifactIsCurrent) {
      setSliceArtifact(null)
      setBridgeState({ kind: 'stale', text: 'Settings changed — slice again before sending' })
    }
  }, [artifactIsCurrent, sliceArtifact])

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
    if (!artifactIsCurrent) {
      setBridgeState({ kind: 'stale', text: 'Settings changed — slice again before sending' })
      return
    }
    if (start && !window.confirm(`Upload “${filename}” and start printing on the Adventurer 4?`)) return
    setBridgeState({ kind: 'working', text: start ? 'Uploading and starting…' : 'Uploading file…' })
    try {
      const response = await fetch('/api/print', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ filename, gcode: sliceArtifact.gcode, start }),
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
        processPanel={(effectiveSettings, scopedSetSettings, scopeMeta) => <ProcessSettings
          settings={effectiveSettings} setSettings={scopedSetSettings} scopeMeta={scopeMeta} />}
        defaultAutoSlice={false}
        slicer={useSlicer}
        sliceRequest={sliceRequest || null}
        onSliced={({ gcode: result }) => {
          setSliceArtifact({ gcode: result, settingsFingerprint: currentSettingsFingerprint })
          setBridgeState({ kind: 'ready', text: 'Slice complete — review before sending' })
        }}
        onEvent={event => {
          if (event.type === 'slicing') setSlicing(event.value)
          if (event.type === 'progress') setProgress(Math.round(event.value * 100))
          if (event.type === 'error') setBridgeState({ kind: 'error', text: event.value })
        }}
        onExport={(file, name) => {
          if (name.toLowerCase().endsWith('.gcode')) {
            file.text().then(text => {
              setSliceArtifact({ gcode: text, settingsFingerprint: currentSettingsFingerprint })
              setFilename(name)
              setBridgeState({ kind: 'ready', text: 'G-code ready — review before sending' })
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
        {sliceArtifact && artifactIsCurrent && <label className="filename-field"><span>G-CODE FILE</span><input value={filename} onChange={event => setFilename(event.target.value)} aria-label="G-code filename" /></label>}
        <div className="buttons"><button className="button button-secondary" onClick={() => sendPrint(false)} disabled={!artifactIsCurrent || slicing}>UPLOAD FILE <span>↗</span></button><button className="button button-primary" onClick={() => sendPrint(true)} disabled={!artifactIsCurrent || slicing}>UPLOAD + START <span>→</span></button></div>
        <p className="send-footnote">START asks for confirmation before the printer receives a start command.</p>
      </div>
    </section>
    <footer><span>AD4 PRINT STATION <span className="footer-dot">/</span> LOCAL ONLY</span><span>220 × 200 × 250 MM <span className="footer-dot">/</span> 0.4 MM NOZZLE</span></footer>
  </main>
}

createRoot(document.getElementById('root')).render(<App />)
