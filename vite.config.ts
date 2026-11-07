import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, 'src'),
      // satellite.js 7's multi-thread WASM build (top-level await, needs COOP/COEP)
      // is never used; a stub keeps it out of the module graph (#97).
      '#wasm-multi-thread': resolve(import.meta.dirname, 'src/lib/orbit/bulk/noMultiThread.ts'),
    },
  },
  css: {
    modules: {
      localsConvention: 'camelCase',
    },
  },
})
