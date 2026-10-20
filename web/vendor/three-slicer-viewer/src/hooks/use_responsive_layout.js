import { useEffect, useState } from 'react'

export function deriveResponsiveLayout(width, height, inspectorWidth = 320) {
  if (width < 768) return { variant: 'compact', short: height < 520 }
  if (width >= 960 && width - 64 - inspectorWidth >= 480) return { variant: 'expanded', short: false }
  return { variant: 'intermediate', short: false }
}

export function useResponsiveLayout(ref, inspectorWidth = 320) {
  const [size, setSize] = useState({ width: 0, height: 0 })
  useEffect(() => {
    const node = ref.current
    if (!node || typeof ResizeObserver === 'undefined') return
    const measure = entry => {
      const box = entry?.contentRect ?? node.getBoundingClientRect()
      setSize({ width: box.width, height: box.height })
    }
    measure()
    const observer = new ResizeObserver(entries => measure(entries[0]))
    observer.observe(node)
    return () => observer.disconnect()
  }, [ref])
  return deriveResponsiveLayout(size.width, size.height, inspectorWidth)
}
