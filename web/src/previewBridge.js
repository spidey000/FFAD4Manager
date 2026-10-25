// Three Slicer Viewer 0.4 keeps preview ranges inside an open Shadow DOM.
// This adapter mirrors the pinned upstream demo's controls because the public
// viewer API reports layer changes but does not expose range setters.
const controlCache = new WeakMap()

export function getPreviewControls(host) {
  if (!host) return null
  const cached = controlCache.get(host)
  if (cached?.layer.isConnected && (!cached.move || cached.move.isConnected)
    && (cached.move || !cached.root.querySelector('[data-testid="move-range"]'))) return cached
  const root = [...host.querySelectorAll('*')].map(element => element.shadowRoot)
    .find(shadow => shadow?.querySelector('.app-shell'))
  if (!root) return null
  const find = name => root.querySelector(`[data-testid="${name}"]`)
  const layer = find('layer-hi'), move = find('move-range'), single = find('single-layer-btn')
  if (!layer || !single) return null
  const controls = { root, layer, low: find('layer-lo'), move, single, reset: find('move-reset') }
  controlCache.set(host, controls)
  return controls
}

function changeRange(input, value) {
  if (!input) return false
  const clamped = Math.min(Number(input.max), Math.max(Number(input.min), Number(value)))
  if (!Number.isFinite(clamped)) return false
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, String(clamped))
  input.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
  input.dispatchEvent(new Event('change', { bubbles: true, composed: true }))
  return true
}

export function selectPreviewLayer(host, layerIndex, singleLayer = false) {
  const controls = getPreviewControls(host)
  if (!controls) return false
  if (controls.single.classList.contains('on') !== singleLayer) controls.single.click()
  if (!singleLayer) changeRange(controls.low, 0)
  changeRange(controls.layer, layerIndex)
  return true
}
export function scrubPreviewMove(host, moveIndex) {
  const controls = getPreviewControls(host)
  return controls?.move ? changeRange(controls.move, moveIndex) : false
}
export function fullPreviewLayer(host) { getPreviewControls(host)?.reset?.click() }
export function previewMoveCount(host) {
  const controls = getPreviewControls(host)
  return controls?.move ? Number(controls.move.max) || 0 : 0
}
