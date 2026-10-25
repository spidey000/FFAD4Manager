import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import Viewport, { useSlicer } from 'three-slicer-viewer'
import { makeSlicerWorker } from 'three-slicer/client'
import {
  bundledCatalog, printerDefaultPreset, printerKeys, printerSettings,
  printersByVendor, processPresets, filamentPresets,
} from 'three-slicer/settings'
import FilamentSettingsPanel from './FilamentSettingsPanel.jsx'
import ProcessSettings from './ProcessSettings.jsx'
import {
  fullPreviewLayer, getPreviewControls, previewMoveCount, scrubPreviewMove, selectPreviewLayer,
} from './previewBridge.js'
import './step_loader.js'
import './style.css'

const PRINTER = 'Flashforge Adventurer 4 Series 0.4 Nozzle'
const DEFAULT_FILENAME = 'adventurer4_print.gcode'
const bridgeToken = document.querySelector('meta[name="ffadv4manager-token"]')?.content ?? ''
const slicer = deps => useSlicer({ ...deps, makeWorker: makeSlicerWorker })
function applyPreset(base, preset, keys, idKey, name) {
  const next = { ...base }
  for (const key of keys || []) delete next[key]
  Object.assign(next, preset || {})
  if (idKey) next[idKey] = name
  return next
}
const settingsFingerprint = value => JSON.stringify(value, (_key, item) => (
  item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item
))
const responsiveViewerCss = `
.app-body { padding-bottom: var(--demo-preview-bottom, 0px); }
.stats-card { left: 60px; }
@media (max-width: 767px) {
  .app-shell { font-size: 12px; }
  .topbar { flex: 0 0 86px; height: 86px; display: grid; grid-template-columns: minmax(0,1fr) auto; grid-template-rows: 38px 38px; gap: 4px 8px; padding: 3px 8px; }
  .topbar:has(.tb-gcode) { flex-basis: 122px; height: 122px; grid-template-rows: 38px 38px 34px; }
  .topbar .tb-left { grid-column: 1 / -1; grid-row: 1; min-width: 0; width: 100%; flex: none; overflow-x: auto; scrollbar-width: none; gap: 5px; }
  .topbar .tb-left::-webkit-scrollbar { display: none; }
  .topbar .tb-left > * { flex: 0 0 auto; }
  .topbar .tb-tabs { grid-column: 1; grid-row: 2; justify-self: start; }
  .topbar .tb-right { grid-column: 2; grid-row: 2; min-width: 0; flex: none; gap: 5px; }
  .topbar .tb-gcode { grid-column: 1 / -1; grid-row: 3; min-width: 0; overflow: hidden; }
  .topbar .tb-gcode span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tb-logo { font-size: 12px; white-space: nowrap; }
  .tb-btn { padding: 5px 7px; font-size: 11px; white-space: nowrap; }
  .tb-tabs button { padding: 6px 12px; font-size: 11px; }
  .left-rail { flex-basis: 42px; padding: 6px 0; gap: 3px; overflow-y: auto; scrollbar-width: none; }
  .left-rail button { width: 34px; height: 34px; }
  .sidebar { display: none !important; }
  .vp-top-toolbar { top: 8px; max-width: calc(100% - 16px); }
  .vp-top-toolbar button { width: 30px; height: 30px; }
  .plate-bar { right: 8px; bottom: 96px; max-width: calc(100% - 16px); overflow-x: auto; }
  .brush-panel { top: 50px; left: 6px; width: min(214px, calc(100% - 12px)); }
  .stats-card, .bed-warn { left: 8px; bottom: 96px; max-width: min(48%, 190px); font-size: 11px; }
}
@media (min-width: 768px) and (max-width: 1100px) {
  .sidebar { flex-basis: min(300px, 35vw); width: min(300px, 35vw); }
  .topbar { gap: 7px; padding: 0 8px; }
  .tb-tabs button { padding-left: 12px; padding-right: 12px; }
}`
const responsiveSettingsCss = `
@media (max-width: 767px) {
  :host(.sp-embedded) .settings-panel { width: 100%; height: 100%; min-width: 0; min-height: 0; }
  :host(.sp-embedded) .sp-top { flex: 0 0 auto; padding: 9px 10px; }
  :host(.sp-embedded) .sp-body { flex: 1 1 auto; min-height: 0; max-height: none; overflow-y: auto; padding: 8px 10px 22px; }
  .settings-panel .row { grid-template-columns: minmax(0,1fr) auto; }
  .settings-panel .row .key { max-width: 115px; }
  .settings-panel .row input:not([type="checkbox"]):not([type="color"]), .settings-panel .row select, .settings-panel .row textarea { max-width: min(150px, 44vw); }
  .sp-pages { flex-wrap: nowrap; overflow-x: auto; padding-bottom: 3px; }
  .sp-pages button { flex: 0 0 auto; }
}`

function App() {
  const [settings, setSettings] = useState(() => printerSettings(PRINTER) ?? {})
  const [plateSettings, setPlateSettings] = useState({})
  const [catalog, setCatalog] = useState(null)
  const [machineMissing, setMachineMissing] = useState(false)
  const [mobile, setMobile] = useState(() => matchMedia('(max-width: 767px)').matches)
  const [drawer, setDrawer] = useState(false)
  const [sliceRequest, setSliceRequest] = useState(0)
  const [status, setStatus] = useState('Open or drop a model to get started')
  const [progress, setProgress] = useState(null)
  const [slicing, setSlicing] = useState(false)
  const [selectedPlate, setSelectedPlate] = useState(0)
  const selectedPlateRef = useRef(0)
  const [plateCount, setPlateCount] = useState(1)
  const plateCountRef = useRef(1)
  const [artifact, setArtifact] = useState(null)
  const artifactRef = useRef(null)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [cameraRefresh, setCameraRefresh] = useState(0)
  const [cameraImage, setCameraImage] = useState('')
  const [cameraState, setCameraState] = useState({ kind: 'loading', text: 'Requesting a printer snapshot…' })
  const [filenameExpanded, setFilenameExpanded] = useState(false)
  const [preview, setPreview] = useState({ mode: 'prepare', count: 0, layer: 0, move: 0, max: 0, single: false, playing: false, hasMoves: false, plate: 0 })
  const [sourceOpen, setSourceOpen] = useState(false)
  const viewerHost = useRef(null)
  const animation = useRef(null)
  const playback = useRef({ layer: 0, move: 0, last: 0, remainder: 0, speed: 1, count: 0, waiting: false })
  const manualSelection = useRef(false)
  const cameraDialog = useRef(null)
  const cameraTrigger = useRef(null)
  const cameraClose = useRef(null)
  const drawerTrigger = useRef(null)
  const currentFingerprint = settingsFingerprint({ settings, plateSettings })
  const previewVisible = preview.mode === 'preview' && preview.count > 0

  const invalidateArtifact = message => {
    artifactRef.current = null
    setArtifact(null)
    if (message) setStatus(message)
  }

  useEffect(() => {
    const query = matchMedia('(max-width: 767px)')
    const update = () => setMobile(query.matches)
    update()
    query.addEventListener?.('change', update)
    return () => query.removeEventListener?.('change', update)
  }, [])

  useEffect(() => {
    if (!printerSettings(PRINTER)) { setMachineMissing(true); return }
    let live = true
    Promise.all([processPresets(), filamentPresets()]).then(([process, filament]) => {
      if (!live) return
      setCatalog({ process, filament })
      const processName = process.listFor(PRINTER)[0] || ''
      const materials = filament.listFor(PRINTER) || []
      const materialName = (materials.find(item => item.name === 'Generic PLA @Flashforge AD4')
        ?? materials.find(item => /\bPLA\b/i.test(item.name)))?.name || ''
      setSettings(current => {
        let next = processName ? applyPreset(current, process.settingsFor(processName), process.keys) : current
        if (materialName) next = applyPreset(next, filament.settingsFor(materialName), filament.keys)
        return { ...next, filament_type: ['PLA'], filament_vendor: ['Artillery'], filament_flow_ratio: [1],
          nozzle_temperature: [210], nozzle_temperature_initial_layer: [210], hot_plate_temp: [55], hot_plate_temp_initial_layer: [55] }
      })
      if (!materialName) setStatus('No PLA profile is available for this printer.')
    }).catch(() => { if (live) setStatus('Profile catalogs could not be loaded.') })
    return () => { live = false }
  }, [])

  useEffect(() => {
    if (!cameraOpen) return
    requestAnimationFrame(() => cameraClose.current?.focus())
    let live = true
    setCameraState({ kind: 'loading', text: 'Requesting a printer snapshot…' })
    fetch('/api/camera/snapshot', { method: 'POST', headers: { Authorization: `Bearer ${bridgeToken}` } })
      .then(async response => {
        if (response.redirected || response.status === 401 || response.status === 403) throw new Error('Access session expired or missing. Sign in and retry.')
        if (!response.ok) {
          let message = `Printer snapshot failed (${response.status}).`
          try { message = (await response.json()).error || message } catch { /* Plain HTTP error. */ }
          throw new Error(message)
        }
        if ((response.headers.get('content-type') || '').toLowerCase().includes('json')) {
          const result = await response.json()
          throw new Error(result?.error || 'The printer bridge returned an error instead of a JPEG.')
        }
        const blob = await response.blob()
        if (!live) return
        if (!blob.type.toLowerCase().includes('image/jpeg')) throw new Error('The printer returned a response that is not a JPEG snapshot.')
        const url = URL.createObjectURL(blob)
        setCameraImage(old => { if (old) URL.revokeObjectURL(old); return url })
        setCameraState({ kind: 'success', text: 'Snapshot received from the printer.' })
      }).catch(error => { if (live) setCameraState({ kind: 'error', text: error.message || 'Could not reach the printer bridge.' }) })
    return () => { live = false }
  }, [cameraOpen, cameraRefresh])

  useEffect(() => {
    if (cameraOpen) cameraDialog.current?.showModal()
    else if (cameraDialog.current?.open) cameraDialog.current.close()
  }, [cameraOpen])
  useEffect(() => () => { if (cameraImage) URL.revokeObjectURL(cameraImage) }, [cameraImage])
  useEffect(() => {
    if (!drawer) return
    const onKey = event => {
      if (event.key === 'Escape') { setDrawer(false); return }
      if (event.key !== 'Tab') return
      const items = [...document.querySelectorAll('.settings-drawer button:not(:disabled), .settings-drawer select:not(:disabled), .settings-drawer input:not(:disabled), .settings-drawer [tabindex="0"]')]
        .filter(item => item.getClientRects().length)
      if (!items.length) return
      const first = items[0], last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    requestAnimationFrame(() => document.querySelector('.settings-drawer.is-open .close-drawer')?.focus())
    return () => { document.removeEventListener('keydown', onKey); requestAnimationFrame(() => drawerTrigger.current?.focus()) }
  }, [drawer])

  const machines = useMemo(() => Object.entries(printersByVendor).sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([vendor, entries]) => Object.keys(entries).sort().map(name => ({ vendor, name }))), [])
  const processes = catalog ? catalog.process.listFor(PRINTER) || [] : []
  const filaments = catalog ? (catalog.filament.recommendedFor?.(PRINTER) || catalog.filament.listFor(PRINTER) || []) : []

  function chooseProcess(name) {
    if (!catalog || !name) return
    setSettings(current => applyPreset(current, catalog.process.settingsFor(name), catalog.process.keys))
    invalidateArtifact('Settings changed — slice again before sending.')
  }
  function chooseFilament(name) {
    if (!catalog || !name) return
    setSettings(current => applyPreset(current, catalog.filament.settingsFor(name), catalog.filament.keys))
    invalidateArtifact('Settings changed — slice again before sending.')
  }
  function chooseMachine(name) {
    if (name !== PRINTER) return
    const preset = printerDefaultPreset(name)
    setSettings(current => {
      const next = applyPreset(current, printerSettings(name), printerKeys, 'printer_settings_id', name)
      return preset && catalog ? applyPreset(next, catalog.process.settingsFor(preset), catalog.process.keys) : next
    })
    invalidateArtifact('Settings changed — slice again before sending.')
  }

  function closeCamera() {
    setCameraOpen(false)
    setCameraImage(old => { if (old) URL.revokeObjectURL(old); return '' })
    requestAnimationFrame(() => cameraTrigger.current?.focus())
  }
  function pausePlayback() {
    if (animation.current != null) cancelAnimationFrame(animation.current)
    animation.current = null
    playback.current.last = 0
    playback.current.remainder = 0
    setPreview(old => old.playing ? { ...old, playing: false } : old)
  }
  function selectLayer(layer, single = preview.single) {
    pausePlayback()
    manualSelection.current = true
    const index = Math.min(Math.max(0, Number(layer) || 0), Math.max(0, preview.count - 1))
    if (!selectPreviewLayer(viewerHost.current, index, single)) return
    fullPreviewLayer(viewerHost.current)
    playback.current.layer = index
    playback.current.move = 0
    setPreview(old => ({ ...old, layer: index, single, move: 0 }))
    requestAnimationFrame(() => setPreview(old => ({ ...old, max: previewMoveCount(viewerHost.current) })))
  }
  function playPlayback(speed = 1) {
    if (!previewVisible || !getPreviewControls(viewerHost.current)?.move) return
    if (animation.current != null) cancelAnimationFrame(animation.current)
    const state = playback.current
    state.count = preview.count
    state.layer = manualSelection.current ? preview.layer : 0
    state.move = manualSelection.current ? preview.move : 0
    state.speed = speed
    state.last = 0
    state.remainder = 0
    state.waiting = false
    selectPreviewLayer(viewerHost.current, state.layer, false)
    manualSelection.current = true
    setPreview(old => ({ ...old, layer: state.layer, single: false, playing: true }))
    const tick = timestamp => {
      const run = playback.current
      if (run.waiting) { run.waiting = false; scrubPreviewMove(viewerHost.current, 0) }
      const max = previewMoveCount(viewerHost.current)
      if (!getPreviewControls(viewerHost.current)) { pausePlayback(); return }
      const elapsed = run.last ? Math.min(100, timestamp - run.last) : 0
      run.last = timestamp
      run.remainder += elapsed * .08 * run.speed
      const step = Math.floor(run.remainder)
      run.remainder -= step
      if (step > 0 && max > 0) { run.move = Math.min(max, run.move + step); scrubPreviewMove(viewerHost.current, run.move) }
      if (max === 0 || run.move >= max) {
        if (run.layer >= run.count - 1) { animation.current = null; setPreview(old => ({ ...old, layer: run.layer, move: max, max, playing: false })); return }
        run.layer++; run.move = 0; run.remainder = 0; selectPreviewLayer(viewerHost.current, run.layer, false); run.waiting = true
      }
      setPreview(old => ({ ...old, layer: run.layer, move: run.move, max }))
      animation.current = requestAnimationFrame(tick)
    }
    animation.current = requestAnimationFrame(tick)
  }
  function stopPlayback() {
    pausePlayback()
    manualSelection.current = true
    if (selectPreviewLayer(viewerHost.current, 0, false)) requestAnimationFrame(() => scrubPreviewMove(viewerHost.current, 0))
    setPreview(old => ({ ...old, layer: 0, move: 0, single: false }))
  }
  useEffect(() => () => { if (animation.current != null) cancelAnimationFrame(animation.current) }, [])

  useEffect(() => {
    const install = () => {
      for (const host of viewerHost.current?.querySelectorAll('*') ?? []) {
        const root = host.shadowRoot
        if (!root || !root.querySelector('.app-shell') || root.querySelector('[data-ad4-responsive]')) continue
        const style = document.createElement('style')
        style.dataset.ad4Responsive = ''
        style.textContent = responsiveViewerCss
        root.append(style)
      }
      for (const host of document.querySelectorAll('.settings-surface *')) {
        const root = host.shadowRoot
        if (!root || !root.querySelector('.settings-panel') || root.querySelector('[data-ad4-settings-responsive]')) continue
        const style = document.createElement('style')
        style.dataset.ad4SettingsResponsive = ''
        style.textContent = responsiveSettingsCss
        root.append(style)
      }
    }
    install()
    const observer = new MutationObserver(install)
    const root = document.getElementById('root')
    if (root) observer.observe(root, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])

  const artifactMatchesSettings = artifact && artifact.fingerprint === currentFingerprint
  // 0.4.0 onSliced has no scene/model revision or slice provenance. Do not offer a G-code
  // artifact for upload until the viewer exposes a revision signal that covers model and paint edits.
  const canSend = false

  async function sendPrint(start) {
    if (!canSend || !artifact) return
    if (start && !window.confirm(`Upload “${artifact.filename}” and start printing on the Adventurer 4?`)) return
    setStatus(start ? 'Uploading and starting…' : 'Uploading file…')
    try {
      const response = await fetch('/api/print', { method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bridgeToken}` },
        body: JSON.stringify({ filename: artifact.filename, gcode: artifact.gcode, start }) })
      if (response.redirected || !response.headers.get('content-type')?.toLowerCase().includes('json')) {
        setStatus('Access session expired or missing. Sign in through Access and retry.'); return
      }
      const result = await response.json()
      setStatus(result.success ? result.message || 'File sent to the printer bridge.' : result.error || `Printer bridge rejected the request (${response.status}).`)
    } catch { setStatus('Could not reach the local printer bridge.') }
  }

  const statusText = progress == null ? status : `Slicing… ${Math.round(progress * 100)}%`
  const drawerPanels = <div className="drawer-custom-panels"><h3>Process controls</h3><ProcessSettings settings={settings} setSettings={setSettings} /><h3>Filament details</h3><FilamentSettingsPanel settings={settings} setSettings={setSettings} /></div>
  return <main className={`demo-shell${previewVisible ? ' has-preview' : ''}`}>
    <div className="viewport-host" ref={viewerHost}>
      <Viewport slicer={slicer} catalog={bundledCatalog} settings={settings} setSettings={value => { setSettings(value); invalidateArtifact('Settings changed — slice again before sending.') }}
        plateSettings={plateSettings} setPlateSettings={value => { setPlateSettings(value); invalidateArtifact('Plate settings changed — slice again before sending.') }}
        defaultExtruderColors={['#a7e43d']}
        processPanel={(effective, setter, meta) => <ProcessSettings settings={effective} setSettings={setter} scopeMeta={meta} />}
        filamentPanel={(effective, setter, meta) => <FilamentSettingsPanel settings={effective} setSettings={setter} ownerMeta={meta} />}
        panels={mobile ? { printerCard: false, filamentCard: false, objectList: false, processCard: false, sliceBar: false, towerCard: false, resinCard: false } : undefined}
        features={cameraOpen ? { shortcuts: false } : undefined}
        defaultAutoSlice={false} sliceRequest={sliceRequest || null}
        onEvent={event => {
          if (event.type === 'progress') setProgress(event.value)
          if (event.type === 'slicing') { setSlicing(Boolean(event.value)); if (!event.value) setProgress(null); else pausePlayback() }
          if (event.type === 'error') { setProgress(null); setStatus(`Error: ${event.value}`) }
          if (event.type === 'notice') setStatus(event.value)
          if (event.type === 'canvasMode') { if (event.value !== 'preview') pausePlayback(); setPreview(old => ({ ...old, mode: event.value })) }
          if (event.type === 'layerCount') { pausePlayback(); manualSelection.current = false; setPreview(old => ({ ...old, count: event.value, layer: Math.min(old.layer, Math.max(0, event.value - 1)) })) }
          if (event.type === 'layerRange') { setPreview(old => ({ ...old, layer: event.value.hi })); requestAnimationFrame(() => setPreview(old => ({ ...old, max: previewMoveCount(viewerHost.current) }))) }
          if (event.type === 'moveScrub' && animation.current == null) setPreview(old => ({ ...old, move: event.value.at, max: event.value.max }))
          if (event.type === 'selectedPlate') { pausePlayback(); manualSelection.current = false; selectedPlateRef.current = event.value; setSelectedPlate(event.value); setPreview(old => ({ ...old, plate: event.value, layer: 0, move: 0 })); invalidateArtifact('Plate changed — slice again before sending.') }
          if (event.type === 'plateCount') { plateCountRef.current = Number(event.value) || 1; setPlateCount(plateCountRef.current); invalidateArtifact('Plate layout changed — slice again before sending.') }
          // Preserve fail-closed behavior for forks that expose a revision event; upstream 0.4.0 does not.
          if (event.type === 'sceneRevision' || event.type === 'modelChanged' || event.type === 'paintChanged') invalidateArtifact('Model or paint changed — slice again before sending.')
        }}
        onSliced={({ gcode, plate, stats }) => {
          pausePlayback(); manualSelection.current = false; setProgress(null)
          const plateIndex = Number.isInteger(plate) ? plate : selectedPlateRef.current
          const next = { gcode, plate: plateIndex, fingerprint: currentFingerprint, filename: plateIndex ? `plate_${plateIndex + 1}.gcode` : DEFAULT_FILENAME, stats }
          artifactRef.current = next
          setArtifact(next)
          setStatus(`Slice complete · ${stats?.layers ?? '—'} layers. Upload is locked: viewer has no model/paint revision signal.`)
          requestAnimationFrame(() => setPreview(old => ({ ...old, hasMoves: Boolean(getPreviewControls(viewerHost.current)?.move) })))
        }}
        onExport={(file, filename) => {
          if (!filename?.toLowerCase().endsWith('.gcode')) return false
          const plateIndex = selectedPlateRef.current
          file.text().then(gcode => {
            const next = { gcode, plate: plateIndex, fingerprint: currentFingerprint, filename, stats: null }
            artifactRef.current = next; setArtifact(next)
            setStatus('G-code exported. Upload is locked: viewer has no model/paint revision signal.')
          })
          return true
        }}
      />
    </div>

    {previewVisible && <section className="playback-dock" aria-label="Print path preview controls">
      <div className="playback-heading"><strong>Print path preview</strong><span>Layer {preview.layer + 1} / {preview.count}</span></div>
      <div className="playback-layer"><label htmlFor="preview-layer">Layers</label><input id="preview-layer" type="range" min="1" max={preview.count} value={preview.layer + 1} onChange={event => selectLayer(Number(event.target.value) - 1)} aria-label="Select preview layer" />
        <button type="button" className={preview.single ? 'is-selected' : ''} aria-pressed={preview.single} onClick={() => selectLayer(preview.layer, !preview.single)}>Single layer</button></div>
      <div className="playback-actions"><button type="button" disabled={!preview.hasMoves} onClick={() => playPlayback(1)} aria-label="Play preview">▶</button><button type="button" disabled={!preview.hasMoves} onClick={() => playPlayback(8)} aria-label="Fast forward preview">⏩</button><button type="button" disabled={!preview.hasMoves} onClick={pausePlayback} aria-label="Pause preview">Ⅱ</button><button type="button" disabled={!preview.hasMoves} onClick={stopPlayback} aria-label="Stop and return to start">■</button>
        <input type="range" disabled={!preview.hasMoves} min="0" max={Math.max(1, preview.max)} value={Math.min(preview.move, Math.max(1, preview.max))} onChange={event => { pausePlayback(); scrubPreviewMove(viewerHost.current, Number(event.target.value)) }} aria-label="Explore moves in this layer" />
        <span className="playback-count">{preview.hasMoves ? `${preview.move} / ${preview.max}` : 'No FFF nozzle moves'}</span></div>
    </section>}

    <header className="topbar"><a className="tb-logo" href="#workspace" aria-label="AD4 Print Station">AD4 <span>PRINT STATION</span></a>
      <div className="tb-state"><i /> LOCAL PRINTER BRIDGE</div>
      <button className="tb-source" type="button" onClick={() => setSourceOpen(value => !value)} aria-expanded={sourceOpen}>Source & license</button>
      {sourceOpen && <aside className="source-notice"><strong>Adapted interface</strong><span>Modified 25 October 2026 · AGPL-3.0-or-later</span>
        <a href="https://github.com/spidey000/Three_slicer_responsive/tree/5c69dd7a0c6af03908f6ef512b18bf6196c7ad38" target="_blank" rel="noreferrer">Pinned upstream source ↗</a>
        <a href="https://github.com/spidey000/Three_slicer_responsive/blob/5c69dd7a0c6af03908f6ef512b18bf6196c7ad38/LICENSE" target="_blank" rel="noreferrer">AGPL-3.0 license ↗</a></aside>}
    </header>

    {mobile && <nav className="mobile-nav" aria-label="Quick actions">
      <button className="nav-setting" ref={drawerTrigger} onClick={() => setDrawer(true)}><span aria-hidden="true">☷</span>Settings</button>
      <span className="nav-status" role="status" aria-live="polite">{statusText}</span>
      <button className="nav-slice" onClick={() => setSliceRequest(value => value + 1)} disabled={slicing || machineMissing}><span aria-hidden="true">▶</span>Slice</button>
      <button className="nav-camera" aria-label="Open printer camera snapshot" onClick={() => { setCameraOpen(true); setCameraRefresh(value => value + 1) }}>◉</button>
      <button className="nav-send" disabled={!canSend || slicing || machineMissing} title="Upload unavailable: viewer provides no model/paint revision signal" onClick={() => sendPrint(false)}>Upload</button>
      <button className="nav-start" disabled={!canSend || slicing || machineMissing} title="Upload unavailable: viewer provides no model/paint revision signal" onClick={() => sendPrint(true)}>Upload + start</button>
    </nav>}

    {!mobile && <aside className="desktop-actions" aria-label="Slicer actions">
      <div className="action-status" role="status" aria-live="polite">{statusText}</div>
      {artifact && <button className="filename-toggle" aria-expanded={filenameExpanded} onClick={() => setFilenameExpanded(value => !value)}>G-code filename</button>}
      {filenameExpanded && artifact && <label className="filename-field">Filename<input aria-label="G-code filename" value={artifact.filename} onChange={event => { const updated = { ...artifact, filename: event.target.value }; setArtifact(updated); artifactRef.current = updated }} /></label>}
      <button className="slice-button" onClick={() => setSliceRequest(value => value + 1)} disabled={slicing || machineMissing}>Slice</button>
      <button className="camera-button" aria-label="Open printer camera snapshot" onClick={() => { setCameraOpen(true); setCameraRefresh(value => value + 1) }}>◉ Camera</button>
      <button className="upload-button" disabled={!canSend || slicing || machineMissing} title="Upload unavailable: viewer provides no model/paint revision signal" onClick={() => sendPrint(false)}>Upload file</button>
      <button className="start-button" disabled={!canSend || slicing || machineMissing} title="Upload unavailable: viewer provides no model/paint revision signal" onClick={() => sendPrint(true)}>Upload + start</button>
    </aside>}

    {mobile && <>
      {drawer && <button className="drawer-scrim" aria-label="Close settings" onClick={() => setDrawer(false)} />}
      <section className={`settings-drawer${drawer ? ' is-open' : ''}`} role="dialog" aria-modal="true" aria-label="Slicer settings" aria-hidden={!drawer}>
        <div className="drawer-handle" /><header className="drawer-header"><div><strong>Printer settings</strong><small>Machine, process and material</small></div><button className="close-drawer" onClick={() => { setDrawer(false); requestAnimationFrame(() => drawerTrigger.current?.focus()) }} aria-label="Close settings">×</button></header>
        <div className="profile-selects"><label>Printer<select value={PRINTER} onChange={event => chooseMachine(event.target.value)}><option value={PRINTER}>{PRINTER}</option>{machines.filter(item => item.name !== PRINTER).map(item => <option key={item.name} value={item.name}>{item.vendor} · {item.name}</option>)}</select></label>
          <label>Process<select disabled={!catalog} value={settings.print_settings_id ?? ''} onChange={event => chooseProcess(event.target.value)}><option value="">Select process</option>{processes.map(name => <option key={name} value={name}>{name}</option>)}</select></label>
          <label>Material<select disabled={!catalog} value={settings.filament_settings_id ?? ''} onChange={event => chooseFilament(event.target.value)}><option value="">Select material</option>{filaments.map(item => { const name = typeof item === 'string' ? item : item.name; return <option key={name} value={name}>{name}</option> })}</select></label>
        </div>
      {artifact && <label className="drawer-filename">G-code filename<input value={artifact.filename} onChange={event => { const updated = { ...artifact, filename: event.target.value }; setArtifact(updated); artifactRef.current = updated }} /></label>}
        <div className="settings-surface">{drawerPanels}</div>
        <button className="drawer-slice" onClick={() => { setDrawer(false); setSliceRequest(value => value + 1) }}>Slice model</button>
      </section>
    </>}

    <button ref={cameraTrigger} className="camera-trigger" type="button" aria-label="Open printer camera snapshot" title="Open printer camera snapshot" onClick={() => { setCameraOpen(true); setCameraRefresh(value => value + 1) }}><span aria-hidden="true">◉</span></button>
    <dialog className="camera-modal" ref={cameraDialog} aria-labelledby="camera-title" onCancel={event => { event.preventDefault(); closeCamera() }}>
      <header className="camera-head"><div><span className="camera-eyebrow">PRINTER SNAPSHOT</span><h2 id="camera-title">Printer camera</h2></div><button ref={cameraClose} type="button" className="camera-close" onClick={closeCamera} aria-label="Close camera">×</button></header>
      <div className="camera-frame" aria-busy={cameraState.kind === 'loading'}>{cameraImage ? <img src={cameraImage} alt="Latest image captured from the printer" /> : <p className={`camera-message ${cameraState.kind}`} role={cameraState.kind === 'error' ? 'alert' : 'status'} aria-live="polite">{cameraState.text}</p>}</div>
      {cameraImage && <p className={`camera-message ${cameraState.kind}`} role="status" aria-live="polite">{cameraState.text}</p>}
      <footer className="camera-foot"><span>Captured by the local printer bridge</span><div><button type="button" onClick={() => setCameraRefresh(value => value + 1)} disabled={cameraState.kind === 'loading'}>Retry snapshot</button><button type="button" onClick={closeCamera}>Done</button></div></footer>
    </dialog>
    <footer className="desktop-preview-status"><span>{statusText}</span>{slicing && <progress max="1" value={progress ?? 0} aria-label={`Slicing ${Math.round((progress ?? 0) * 100)} percent`} />}</footer>
  </main>
}

createRoot(document.getElementById('root')).render(<App />)
