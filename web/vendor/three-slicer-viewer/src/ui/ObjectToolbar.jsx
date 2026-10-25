import React, { useCallback, useEffect, useRef, useState } from 'react'

function scrollEdges(el) {
  const max = el.scrollWidth - el.clientWidth
  return { overflow: max > 1, end: max - el.scrollLeft <= 1 }
}

// Renders the objectTools() array. Entries with `sep` become dividers; entries without `run` are disabled.
// The wrapper owns the floating position and the edge fade, because a pseudo-element inside the horizontal
//  scroller would scroll away with the content instead of staying pinned to the visible right edge.
export default function ObjectToolbar({ tools }) {
  const scrollerRef = useRef(null)
  const [edges, setEdges] = useState({ overflow: false, end: false })
  const measure = useCallback(() => {
    const el = scrollerRef.current
    if (!el) return
    const next = scrollEdges(el)
    setEdges(current => current.overflow === next.overflow && current.end === next.end ? current : next)
  }, [])
  useEffect(() => {
    measure()
    const el = scrollerRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [measure, tools])
  return (
    <div className="vp-toolbar-wrap" data-overflow={edges.overflow} data-scroll-end={edges.end}>
      <div ref={scrollerRef} className="vp-top-toolbar" role="toolbar" aria-label="Object tools" onScroll={measure}>
        {tools.map((t, i) => t.sep
          ? <span key={'sep' + i} className="vtt-sep" />
          : <button key={t.id} onClick={t.run} disabled={t.disabled?.() ?? !t.run}
              title={t.tip} data-testid={`tool-${t.id}`}><img src={t.icon} alt={t.label} /></button>)}
      </div>
    </div>
  )
}
