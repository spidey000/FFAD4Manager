import { useEffect, useState } from 'react'

export function deriveResponsiveLayout(width, height, inspectorWidth = 320, compactBreakpoint = 768) {
  if (width < compactBreakpoint) return { variant: 'compact', short: height < 520 }
  if (width >= 960 && width - 64 - inspectorWidth >= 480) return { variant: 'expanded', short: false }
  return { variant: 'intermediate', short: false }
}

export function sheetSnapHeights(availableHeight, actionHeight = 148) {
  const collapsed = Math.min(64, availableHeight)
  const half = Math.max(collapsed, Math.min(availableHeight * 0.52, availableHeight - actionHeight - 180))
  const expanded = Math.max(collapsed, availableHeight - actionHeight)
  return { collapsed, half, expanded }
}

export function snapSheetHeight(height, velocityY, availableHeight, actionHeight = 148, velocityThreshold = 0.6) {
  const snaps = sheetSnapHeights(availableHeight, actionHeight)
  const stops = ['collapsed', 'half', 'expanded']
  if (Math.abs(velocityY) >= velocityThreshold) {
    const nearest = stops.reduce((best, stop) => Math.abs(snaps[stop] - height) < Math.abs(snaps[best] - height) ? stop : best, stops[0])
    const index = stops.indexOf(nearest)
    return stops[Math.max(0, Math.min(stops.length - 1, index + (velocityY > 0 ? 1 : -1)))]
  }
  return stops.reduce((best, stop) => Math.abs(snaps[stop] - height) < Math.abs(snaps[best] - height) ? stop : best, stops[0])
}

export function effectiveSheetSnap(preferred, short, shortEditing = false) {
  return short ? (shortEditing ? 'expanded' : 'collapsed') : preferred
}

export function sheetSnapTransition(preferred, short, shortEditing, requested) {
  return short
    ? { preferred, shortEditing: requested !== 'collapsed' }
    : { preferred: requested, shortEditing }
}

export function responsiveMeasureTargets(body, actionSurface) {
  return [body, actionSurface].filter(Boolean)
}

export function focusTrapTarget(index, count, backwards) {
  if (!count) return null
  if (backwards && index <= 0) return count - 1
  if (!backwards && (index < 0 || index === count - 1)) return 0
  return null
}

export function useResponsiveLayout(ref, inspectorWidth = 320) {
  const [size, setSize] = useState({ width: 0, height: 0, compactBreakpoint: 768 })
  useEffect(() => {
    const node = ref.current
    if (!node || typeof ResizeObserver === 'undefined') return
    const measure = entry => {
      const box = entry?.contentRect ?? node.getBoundingClientRect()
      const inheritedBreakpoint = node.ownerDocument.defaultView?.getComputedStyle(node).getPropertyValue('--vp-compact-breakpoint')
      const parsedBreakpoint = Number.parseFloat(inheritedBreakpoint)
      setSize({ width: box.width, height: box.height, compactBreakpoint: Number.isFinite(parsedBreakpoint) && parsedBreakpoint > 0 ? parsedBreakpoint : 768 })
    }
    measure()
    const observer = new ResizeObserver(entries => measure(entries[0]))
    observer.observe(node)
    return () => observer.disconnect()
  }, [ref])
  return deriveResponsiveLayout(size.width, size.height, inspectorWidth, size.compactBreakpoint)
}
