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
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            // Rolldown puts a module in the chunk named by the exact set of entries (the
            // page plus every lazy chunk) that import it. A lazy chunk using only part of
            // what the page shares (JSX but no hook, say) split that code into extra
            // first-load files (#162). These groups take everything the page imports
            // statically, whatever the lazy chunks use: libraries in `vendor` (stable
            // across deploys), our own code in the entry's chunk.
            { name: 'vendor', test: /node_modules/, tags: ['$initial'], priority: 10 },
            { name: 'app', tags: ['$initial'] },
          ],
        },
      },
    },
  },
  css: {
    modules: {
      localsConvention: 'camelCase',
    },
  },
})
