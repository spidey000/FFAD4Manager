import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const fromSource = (path) => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig({
  resolve: {
    alias: [
      { find: 'three-slicer-viewer/settings', replacement: fromSource('./src/settings/index.js') },
      { find: 'three-slicer-viewer/data', replacement: fromSource('./src/data.js') },
      { find: 'three-slicer-viewer/toggle', replacement: fromSource('./src/settings/toggle_eval.js') },
      { find: 'three-slicer-viewer/paint', replacement: fromSource('./src/core/paint_tools.js') },
      { find: 'three-slicer-viewer/toolpath', replacement: fromSource('./src/scene/toolpath_gpu.js') },
      { find: 'three-slicer-viewer/gcode', replacement: fromSource('./src/core/gcode_parse.js') },
      { find: 'three-slicer-viewer/loaders', replacement: fromSource('./src/scene/model_loaders.js') },
      { find: 'three-slicer-viewer/components', replacement: fromSource('./src/components/SettingsPanel.jsx') },
      { find: 'three-slicer-viewer', replacement: fromSource('./src/index.js') },
    ],
  },
  build: {
    lib: {
      entry: {
        index: fromSource('./src/index.js'),
        toolpath: fromSource('./src/scene/toolpath_gpu.js'),
        gcode_parse: fromSource('./src/core/gcode_parse.js'),
        model_loaders: fromSource('./src/scene/model_loaders.js'),
        components: fromSource('./src/components/SettingsPanel.jsx'),
      },
      formats: ['es'],
      fileName: (_format, entryName) => `${entryName}.js`,
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'three'],
    },
  },
})
