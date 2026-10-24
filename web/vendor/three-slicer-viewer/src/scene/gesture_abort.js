// Shared abort path for a gesture that is no longer ours: a second finger turns it into a camera pinch, and a
//  cancelled pointer means the contact never completed. Every owner is ended here — gizmo drag (restored to its
//  start snapshot), corner scale (restored), box band (dropped), brush stroke (flushed) — and the camera is
//  handed back, so no control is left believing it still owns a pointer.
export function createGestureAbort({ transformCancel, refreshGizmo, transform, scaleBox, boxSelect, paintDrawingRef, paintInput, orbit, invalidate }) {
  return () => {
    let changed = transformCancel.cancel()
    if (changed) refreshGizmo()
    if (scaleBox.dragging()) { scaleBox.cancel(); transform.enabled = true; changed = true }
    if (boxSelect.dragging()) { boxSelect.cancel(); changed = true }
    if (paintDrawingRef.current) { paintDrawingRef.current = false; paintInput.endStroke(); orbit.enabled = true; changed = true }
    if (changed) invalidate()
    return changed
  }
}
