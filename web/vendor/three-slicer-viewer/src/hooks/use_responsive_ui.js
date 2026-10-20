import { useEffect, useRef, useState } from 'react'
import { effectiveSheetSnap, focusTrapTarget, snapSheetHeight } from './use_responsive_layout.js'

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
  const [dragSheetHeight, setDragSheetHeight] = useState(null)
  const dragRef = useRef(null)
  const suppressHandleClickRef = useRef(false)
  const inspectorOpenButtonRef = useRef(null)
  const inspectorDialogRef = useRef(null)
  const restoreFocusRef = useRef(null)
  const effectiveSnap = effectiveSheetSnap(sheetSnap, layout.short)
  const sheetStyle = layout.variant === 'compact' && dragSheetHeight != null ? { '--sheet-height': `${dragSheetHeight}px` } : undefined

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
    setDragSheetHeight(Math.max(64, Math.min(appBodyRef.current?.clientHeight ?? 600, drag.height + drag.y - event.clientY)))
  }
  function finishSheetDrag(event) {
    const drag = dragRef.current
    if (!drag) return
    const available = appBodyRef.current?.clientHeight ?? 600
    const velocity = (drag.y - event.clientY) / Math.max(1, event.timeStamp - drag.time)
    const height = Math.max(64, Math.min(available, drag.height + drag.y - event.clientY))
    setSheetSnap(snapSheetHeight(height, velocity, available))
    cancelSheetDrag()
  }
  function cancelSheetDrag() { dragRef.current = null; setDragSheetHeight(null) }
  function handleSheetClick(event) {
    if (suppressHandleClickRef.current) { suppressHandleClickRef.current = false; event.preventDefault(); return }
    setSheetSnap(value => value === 'collapsed' ? 'half' : value === 'half' ? 'expanded' : 'collapsed')
  }
  function openInspector() {
    restoreFocusRef.current = inspectorOpenButtonRef.current
    setInspectorOpen(true)
  }

  return {
    inspectorOpen, setInspectorOpen, expandedInspectorOpen, setExpandedInspectorOpen,
    sheetSnap, setSheetSnap, effectiveSnap, sheetStyle, dragging: dragSheetHeight != null,
    inspectorOpenButtonRef, inspectorDialogRef, onModalKeyDown, openInspector,
    beginSheetDrag, moveSheetDrag, finishSheetDrag, cancelSheetDrag, handleSheetClick,
  }
}
