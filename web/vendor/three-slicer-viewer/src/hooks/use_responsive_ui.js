import { useCallback, useEffect, useRef, useState } from 'react'
import { effectiveSheetSnap, focusTrapTarget, responsiveMeasureTargets, sheetSnapHeights, sheetSnapTransition, snapSheetHeight } from './use_responsive_layout.js'

function focusableElements(root) {
  const result = []
  const visit = node => {
    const selector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    for (const element of node.querySelectorAll?.(selector) ?? []) {
      if (element.getClientRects().length) result.push(element)
      if (element.shadowRoot) visit(element.shadowRoot)
    }
  }
  visit(root)
  return result
}

function deepestActiveElement() {
  let active = document.activeElement
  while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement
  return active
}

export function useResponsiveUI(layout, appBodyRef) {
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const [expandedInspectorOpen, setExpandedInspectorOpen] = useState(true)
  const [sheetSnap, setSheetSnap] = useState('collapsed')
  const [shortEditing, setShortEditing] = useState(false)
  const [dragSheetHeight, setDragSheetHeight] = useState(null)
  const dragRef = useRef(null)
  const suppressHandleClickRef = useRef(false)
  const inspectorOpenButtonRef = useRef(null)
  const inspectorDialogRef = useRef(null)
  const restoreFocusRef = useRef(null)
  const [actionSurfaceNode, setActionSurfaceNode] = useState(null)
  const actionSurfaceRef = useCallback(node => setActionSurfaceNode(node), [])
  const [workspaceSize, setWorkspaceSize] = useState({ height: 0, actionHeight: 0 })
  const effectiveSnap = effectiveSheetSnap(sheetSnap, layout.short, shortEditing)
  const sheetStops = sheetSnapHeights(workspaceSize.height, workspaceSize.actionHeight)
  const sceneHeight = workspaceSize.height - workspaceSize.actionHeight - (dragSheetHeight ?? sheetStops[effectiveSnap])
  // A strip shorter than 148px cannot hold the floating toolbar plus the bottom status/plate chrome without
  //  overlap; while the sheet is open there, the sheet is the focus and the scene keeps only the canvas.
  const hideSceneChrome = layout.variant === 'compact' && sceneHeight < 148
  const sheetStyle = layout.variant === 'compact' ? {
    '--sheet-collapsed': `${sheetStops.collapsed}px`,
    '--sheet-half': `${sheetStops.half}px`,
    '--sheet-expanded': `${sheetStops.expanded}px`,
    ...(dragSheetHeight != null ? { '--sheet-height': `${dragSheetHeight}px` } : {}),
  } : undefined

  useEffect(() => {
    const body = appBodyRef.current
    if (!body) return
    const measure = () => {
      const height = body.clientHeight
      const actionHeight = actionSurfaceNode?.getBoundingClientRect().height ?? 0
      setWorkspaceSize(current => current.height === height && current.actionHeight === actionHeight
        ? current : { height, actionHeight })
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    responsiveMeasureTargets(body, actionSurfaceNode).forEach(node => observer.observe(node))
    return () => observer.disconnect()
  }, [appBodyRef, actionSurfaceNode, layout.variant])

  useEffect(() => {
    if (layout.short) setShortEditing(false)
  }, [layout.short])

  useEffect(() => {
    if (layout.variant !== 'intermediate' || !inspectorOpen) return
    const dialog = inspectorDialogRef.current
    const focusables = focusableElements(dialog)
    ;(focusables[0] ?? dialog)?.focus?.({ preventScroll: true })
    return () => { restoreFocusRef.current?.focus?.({ preventScroll: true }); restoreFocusRef.current = null }
  }, [layout.variant, inspectorOpen])

  function onModalKeyDown(event) {
    if (layout.variant !== 'intermediate' || !inspectorOpen) return
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation(); setInspectorOpen(false); return
    }
    if (event.key !== 'Tab') return
    const focusables = focusableElements(inspectorDialogRef.current)
    if (!focusables.length) { event.preventDefault(); inspectorDialogRef.current?.focus(); return }
    const index = focusables.indexOf(deepestActiveElement())
    const target = focusTrapTarget(index, focusables.length, event.shiftKey)
    if (target != null) { event.preventDefault(); focusables[target].focus() }
  }

  function beginSheetDrag(event) {
    dragRef.current = { y: event.clientY, height: event.currentTarget.closest('.sidebar')?.getBoundingClientRect().height ?? 64, time: event.timeStamp }
    suppressHandleClickRef.current = false
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  function moveSheetDrag(event) {
    const drag = dragRef.current
    if (!drag) return
    if (Math.abs(event.clientY - drag.y) > 4) suppressHandleClickRef.current = true
    const available = appBodyRef.current?.clientHeight ?? 600
    const actionHeight = actionSurfaceNode?.getBoundingClientRect().height ?? 0
    const expanded = sheetSnapHeights(available, actionHeight).expanded
    setDragSheetHeight(Math.max(64, Math.min(expanded, drag.height + drag.y - event.clientY)))
  }
  function finishSheetDrag(event) {
    const drag = dragRef.current
    if (!drag) return
    const available = appBodyRef.current?.clientHeight ?? 600
    const actionHeight = actionSurfaceNode?.getBoundingClientRect().height ?? 0
    const velocity = (drag.y - event.clientY) / Math.max(1, event.timeStamp - drag.time)
    const height = Math.max(64, Math.min(sheetSnapHeights(available, actionHeight).expanded, drag.height + drag.y - event.clientY))
    setWorkspaceSize({ height: available, actionHeight })
    requestSheetSnap(snapSheetHeight(height, velocity, available, actionHeight))
    cancelSheetDrag()
  }
  function cancelSheetDrag() { dragRef.current = null; setDragSheetHeight(null) }
  function requestSheetSnap(requested) {
    const next = sheetSnapTransition(sheetSnap, layout.short, shortEditing, requested)
    setSheetSnap(next.preferred)
    setShortEditing(next.shortEditing)
  }
  function stepSheet() {
    if (layout.short) { requestSheetSnap(effectiveSnap === 'expanded' ? 'collapsed' : 'expanded'); return }
    setSheetSnap(value => value === 'collapsed' ? 'half' : value === 'half' ? 'expanded' : 'collapsed')
  }
  function returnToScene() {
    requestSheetSnap('collapsed')
    if (layout.variant === 'compact') setInspectorOpen(false)
  }
  function handleSheetClick(event) {
    if (suppressHandleClickRef.current) { suppressHandleClickRef.current = false; event.preventDefault(); return }
    stepSheet()
  }
  function openInspector() {
    restoreFocusRef.current = inspectorOpenButtonRef.current
    setInspectorOpen(true)
  }

  return {
    compact: layout.variant === 'compact', intermediate: layout.variant === 'intermediate',
    inspectorOpen, setInspectorOpen, expandedInspectorOpen, setExpandedInspectorOpen, hideSceneChrome,
    sheetSnap, requestSheetSnap, stepSheet, returnToScene, effectiveSnap, sheetStyle, dragging: dragSheetHeight != null,
    inspectorOpenButtonRef, inspectorDialogRef, actionSurfaceRef, onModalKeyDown, openInspector,
    beginSheetDrag, moveSheetDrag, finishSheetDrag, cancelSheetDrag, handleSheetClick,
  }
}
