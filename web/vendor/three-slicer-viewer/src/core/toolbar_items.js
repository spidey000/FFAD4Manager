import {
  addIcon, deleteIcon, deleteallIcon, duplicateIcon, splitIcon, onbedIcon, arrangeIcon, orientIcon,
  cutIcon, booleanIcon, negativeIcon, seamIcon, mmuIcon, textmarkIcon, measureIcon, varlayerIcon,
  moveIcon, rotateIcon, scaleIcon,
} from './icons.js'

// Object toolbar definition, following the upstream toolbar (GLToolbar) layout.
// Entries without `run` render disabled, and the tooltip says what the button is and why it is unavailable.
// When adding buttons, edit this array instead of duplicating JSX.
export function objectTools(actions, { compact = false, gizmoMode, hasSelection = true } = {}) {
  return [
    ...(compact ? [
      { id: 'gizmo-move', icon: moveIcon, label: 'Move', tip: hasSelection ? 'Move the selected object' : 'Select an object first', run: () => actions.setGizmo('translate'), active: gizmoMode === 'translate', disabled: () => !hasSelection },
      { id: 'gizmo-rotate', icon: rotateIcon, label: 'Rotate', tip: hasSelection ? 'Rotate the selected object' : 'Select an object first', run: () => actions.setGizmo('rotate'), active: gizmoMode === 'rotate', disabled: () => !hasSelection },
      { id: 'gizmo-scale', icon: scaleIcon, label: 'Scale', tip: hasSelection ? 'Scale the selected object — drag a corner to resize X, Y and Z together' : 'Select an object first', run: () => actions.setGizmo('scale'), active: gizmoMode === 'scale', disabled: () => !hasSelection },
      { sep: true },
    ] : []),
    { id: 'add', icon: addIcon, label: 'Add', tip: 'Add a model file to the current plate (existing objects are kept)', run: actions.add },
    { id: 'delete', icon: deleteIcon, label: 'Delete', tip: 'Delete the selected object (Del)', run: actions.remove },
    { id: 'delete-all', icon: deleteallIcon, label: 'Delete all', tip: 'Delete every object on the plate', run: actions.removeAll, disabled: () => actions.objectCount() === 0 },
    { sep: true },
    { id: 'duplicate', icon: duplicateIcon, label: 'Duplicate', tip: 'Duplicate the selected object (Ctrl+K)', run: actions.duplicate },
    { id: 'split', icon: splitIcon, label: 'Split', tip: 'Split to objects — every disconnected part (connected component) becomes its own object. Split to parts is not implemented (no part concept)', run: actions.split },
    { id: 'onbed', icon: onbedIcon, label: 'Place on bed', tip: 'Drop every object onto the bed (Z=0) — to re-seat after lifting with the gizmo', run: actions.placeOnBed },
    { sep: true },
    { id: 'arrange', icon: arrangeIcon, label: 'Arrange', tip: 'Auto arrange — lay objects out on the bed without overlap. Not implemented (needs the libslic3r Arrange port)' },
    { id: 'orient', icon: orientIcon, label: 'Orient', tip: 'Auto orient — rotate to the orientation needing the least support. Not implemented (needs the libslic3r Orient port)' },
    { sep: true },
    { id: 'cut', icon: cutIcon, label: 'Cut', tip: 'Cut — slice the model with a plane into two pieces. Not implemented (needs cut-surface re-stitching)' },
    { id: 'boolean', icon: booleanIcon, label: 'Boolean', tip: 'Mesh boolean — union/difference/intersection of two objects. Not implemented (needs the CGAL boolean port)' },
    { id: 'negative', icon: negativeIcon, label: 'Negative part', tip: 'Add a negative/modifier part — put a part with different properties inside one object. Not implemented (no part concept)' },
    { sep: true },
    { id: 'seam', icon: seamIcon, label: 'Seam painting', tip: 'Seam painting — brush where the layer seam goes. Not implemented (needs kernel seam wiring)' },
    { id: 'mmu', icon: mmuIcon, label: 'Color painting', tip: 'Color painting — brush a region so it prints with another filament (opens on T1; the panel picks the rest)', run: actions.paintMaterial },
    { id: 'text', icon: textmarkIcon, label: 'Text', tip: 'Text/SVG emboss — engrave letters or shapes onto the model surface. Not implemented (needs font rasterization)' },
    { id: 'measure', icon: measureIcon, label: 'Measure', tip: 'Measure — distance and angle between two points or faces. Not implemented' },
    { id: 'varlayer', icon: varlayerIcon, label: 'Variable layers', tip: 'Variable layer height — different layer heights per band. Not implemented (the kernel has no variable z)' },
  ]
}
