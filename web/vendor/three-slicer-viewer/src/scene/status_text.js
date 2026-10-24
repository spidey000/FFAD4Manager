// The viewport status line, kept pure so its exact wording (objects vs empty scene, with and without the
//  keyboard hint) is testable without a renderer. The scene passes the values it already tracks.
export function sceneStatus({ count, selectedCount, selectedName, hoveredName, shortcuts }) {
  const label = selectedCount > 1 ? `${selectedCount} objects` : selectedName || '—'
  return count
    ? `${count} object(s) · selected: ${label}`
      + (shortcuts ? ' | M/R/S · Ctrl+click to add · Shift+drag to box-select · ? for shortcuts' : ' | Ctrl+click to add · Shift+drag to box-select')
    : `hover: ${hoveredName || '—'} · selected: ${label} | left-drag to orbit`
      + (shortcuts ? ' · ? for shortcuts' : '')
}
