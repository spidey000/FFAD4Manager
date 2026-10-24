import { useRef } from 'react'

/** One revision for the whole scene, plus the publishers that move it.
 *
 *  The host keeps sliced G-code and only lets it be sent while it still describes the model and paint on screen, so
 *  every edit that changes what a slice would emit has to move this number at the mutation boundary — not in a later
 *  render or effect, which a fast second edit can overtake. Paint counts are the exception in both directions: a
 *  slice's own paint import/resync reports the paint it is about to read, and counting those replies would mark the
 *  artifact stale the instant it lands. `holdPaintSync` keeps the paint bumper still until that job unwinds.
 */
export function useSceneRevision(onEventRef, { setObjects, setPaintCounts, setPaintStateCounts }) {
  const sceneRevisionRef = useRef(0)
  const paintSyncDepthRef = useRef(0)
  function bump() {
    const value = ++sceneRevisionRef.current
    onEventRef.current?.({ type: 'sceneRevision', value })
  }
  const bumpPaint = () => { if (paintSyncDepthRef.current === 0) bump() }
  async function holdPaintSync(job) {
    paintSyncDepthRef.current += 1
    try { return await job() } finally { paintSyncDepthRef.current -= 1 }
  }
  // Object lists carry every geometry/plate/visibility/extruder edit, so they always invalidate.
  const publishObjects = (next) => { setObjects(next); bump() }
  const publishPaintCounts = (next) => { setPaintCounts(next); bumpPaint() }
  const publishPaintStateCounts = (next) => { setPaintStateCounts(next); bumpPaint() }
  return { sceneRevisionRef, publishObjects, publishPaintCounts, publishPaintStateCounts, holdPaintSync }
}
