// Cancel support for a gizmo drag. TransformControls owns its pointer and has no cancel of its own: pointerUp()
//  ends the drag, and the scene's `dragging-changed` hook would normally seat the mesh and commit the move. A
//  second finger (camera pinch) or a cancelled pointer must instead put the object back where the gesture started
//  and record nothing, so this module snapshots the attached object at drag start and tells the hook to skip the
//  commit on the release that cancel() synthesises.
//
//  A multi-selection is driven through the pivot, so the pivot is the attached object: restoring its pose and
//  releasing it puts every mesh back (releasePivot preserves world transforms).
export function createTransformCancel({ transform, pivot, releasePivot }) {
  let snap = null, token = null, skip = false

  const restore = () => {
    const { object, position, quaternion, scale } = snap
    object.position.copy(position)
    object.quaternion.copy(quaternion)
    object.scale.copy(scale)
    object.updateMatrixWorld(true)
    if (object === pivot) releasePivot()
  }

  return {
    /** Call when the drag starts. `recordToken` is the undo entry the caller recorded (or null). */
    begin(recordToken = null) {
      const object = transform.object
      snap = object
        ? { object, position: object.position.clone(), quaternion: object.quaternion.clone(), scale: object.scale.clone() }
        : null
      token = recordToken || null
      skip = false
    },
    /** Ends the drag and restores the snapshot. Returns true when a drag was actually cancelled. */
    cancel() {
      if (!transform.dragging || !snap) return false
      skip = true
      transform.pointerUp({ button: 0 })   // synchronous: the scene's hook sees takeSkip() and returns early
      restore()
      token?.discard?.()
      snap = null; token = null
      return true
    },
    /** True exactly once, for the release that cancel() triggered. */
    takeSkip() { const was = skip; skip = false; return was },
  }
}
