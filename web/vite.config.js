import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  worker: { format: 'es' },
  esbuild: { target: 'esnext' },
  build: { target: 'esnext' },
})
