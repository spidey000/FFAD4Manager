import React from 'react'
import ProcessCard from './ProcessCard.jsx'

export function SheetControls({ snap, onStep, onReturn, onDown, onMove, onUp, onCancel, onLostCapture, onHandleClick }) {
  return <div className="sheet-controls">
    <button className="sheet-handle" aria-label={`Inspector height: ${snap}; activate to change`}
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}
      onPointerCancel={onCancel} onLostPointerCapture={onLostCapture} onClick={onHandleClick}><span /></button>
    <button className="sheet-step" onClick={onStep} aria-label="Expand or collapse inspector">{snap === 'expanded' ? 'Collapse' : 'Expand'}</button>
    {snap === 'expanded' && <button className="sheet-return" onClick={onReturn}>Return to scene</button>}
  </div>
}

export function InspectorControls({ compact, intermediate, expanded, snap, onStep, onReturn,
  onDown, onMove, onUp, onCancel, onHandleClick, onClose, onFold }) {
  return <>
    {compact && <SheetControls snap={snap} onStep={onStep} onReturn={onReturn} onDown={onDown} onMove={onMove}
      onUp={onUp} onCancel={onCancel} onLostCapture={onCancel} onHandleClick={onHandleClick} />}
    {intermediate && <button className="inspector-close" onClick={onClose} aria-label="Close settings">×</button>}
    {expanded && <button className="inspector-fold" onClick={onFold} aria-label="Close inspector">Close inspector</button>}
  </>
}

export function MobileNavigation({ canvasMode, inspectorOpen, canPrepare, canPreview, onPrepare, onSettings, onLayers }) {
  return <nav className="mobile-navigation" aria-label="Viewer sections">
    <button aria-pressed={!inspectorOpen && canvasMode === 'prepare'} disabled={!canPrepare}
      title={!canPrepare ? 'Close the imported G-code to prepare a model' : undefined} onClick={onPrepare}>Model</button>
    <button aria-pressed={inspectorOpen} onClick={onSettings}>Settings</button>
    <button aria-pressed={canvasMode === 'preview'} disabled={!canPreview}
      title={!canPreview ? 'Slice to view layers' : undefined} onClick={onLayers}>Layers</button>
  </nav>
}

export function IntermediateInspectorControls({ open, openButtonRef, onOpen, onScrim }) {
  return <>
    {open && <div className="inspector-scrim" role="presentation" aria-hidden="true" onPointerDown={onScrim} />}
    <button ref={openButtonRef} className="inspector-open" onClick={onOpen} aria-label="Open settings">Settings</button>
  </>
}

export function ExpandedInspectorActions({ open, onOpen, children }) {
  return <>
    {!open && <button className="inspector-reopen" onClick={onOpen}>Open inspector</button>}
    <div className="expanded-action-surface">{children}</div>
  </>
}

export function ProcessSettingsCard({ visible, panels, ...props }) {
  if (!visible) return null
  const card = <ProcessCard {...props} />
  return panels?.processCard === 'readonly' ? <div className="vp-readonly" inert="">{card}</div> : card
}

export function ResponsiveInert({ visible = true, intermediate, inspectorOpen, children }) {
  if (!visible) return null
  return <div className="responsive-inert-wrapper" {...(intermediate && inspectorOpen ? { inert: '' } : {})}>{children}</div>
}

export function ResponsiveActionSurfaces({ layout, responsiveUI, ok, sliceAction, showPanel }) {
  const { compact, expandedInspectorOpen, setExpandedInspectorOpen, actionSurfaceRef } = responsiveUI
  return <>
    {ok && showPanel('sidebar') && layout.variant === 'expanded' && <ExpandedInspectorActions open={expandedInspectorOpen} onOpen={() => setExpandedInspectorOpen(true)}>{showPanel('sliceBar') && sliceAction}</ExpandedInspectorActions>}
    {ok && showPanel('sidebar') && compact && showPanel('sliceBar') && <div ref={actionSurfaceRef} className="compact-action-surface">{sliceAction}</div>}
  </>
}

export function ResponsiveNavigation({ responsiveUI, canvasMode, gcodeOnly, layerCount, enterCanvasMode }) {
  const { compact, intermediate, inspectorOpen, setInspectorOpen, inspectorOpenButtonRef, openInspector, requestSheetSnap } = responsiveUI
  const onLayers = event => {
    if (!layerCount) return
    const root = event.currentTarget.getRootNode()
    enterCanvasMode('preview'); setInspectorOpen(true); requestSheetSnap('half')
    // The preview card mounts with the mode change; wait two frames before scrolling the sidebar to it.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const scroller = root.querySelector('.sidebar-scroll'), preview = root.querySelector('[data-testid="preview-controls"]')
      if (scroller && preview) scroller.scrollTop += preview.getBoundingClientRect().top - scroller.getBoundingClientRect().top
    }))
  }
  return <>
    {compact && <MobileNavigation canvasMode={canvasMode} inspectorOpen={inspectorOpen} canPrepare={!gcodeOnly} canPreview={layerCount > 0} onPrepare={() => { if (!gcodeOnly) enterCanvasMode('prepare'); setInspectorOpen(false); requestSheetSnap('collapsed') }} onSettings={() => { setInspectorOpen(true); requestSheetSnap('half') }} onLayers={onLayers} />}
    {intermediate && <IntermediateInspectorControls open={inspectorOpen} openButtonRef={inspectorOpenButtonRef} onOpen={openInspector} onScrim={() => setInspectorOpen(false)} />}
  </>
}
