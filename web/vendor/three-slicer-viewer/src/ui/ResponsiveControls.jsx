import React from 'react'

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
    {open && <button className="inspector-scrim" aria-label="Close settings" onClick={onScrim} />}
    <button ref={openButtonRef} className="inspector-open" onClick={onOpen} aria-label="Open settings">Settings</button>
  </>
}

export function ExpandedInspectorActions({ open, onOpen, children }) {
  return <>
    {!open && <button className="inspector-reopen" onClick={onOpen}>Open inspector</button>}
    <div className="expanded-action-surface">{children}</div>
  </>
}
