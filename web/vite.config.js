import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const viewerSource = (path) => fileURLToPath(new URL(`./vendor/three-slicer-viewer/${path}`, import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: 'three-slicer-viewer/settings', replacement: viewerSource('src/settings/index.js') },
      { find: 'three-slicer-viewer/data', replacement: viewerSource('src/data.js') },
      { find: 'three-slicer-viewer/toggle', replacement: viewerSource('src/settings/toggle_eval.js') },
      { find: 'three-slicer-viewer/paint', replacement: viewerSource('src/core/paint_tools.js') },
      { find: 'three-slicer-viewer/toolpath', replacement: viewerSource('src/scene/toolpath_gpu.js') },
      { find: 'three-slicer-viewer/gcode', replacement: viewerSource('src/core/gcode_parse.js') },
      { find: 'three-slicer-viewer/loaders', replacement: viewerSource('src/scene/model_loaders.js') },
      { find: 'three-slicer-viewer/components', replacement: viewerSource('src/components/SettingsPanel.jsx') },
      { find: 'three-slicer-viewer', replacement: viewerSource('src/index.js') },
    ],
  },
  base: './',
  worker: { format: 'es' },
  esbuild: { target: 'esnext' },
  build: { target: 'esnext' },
})
