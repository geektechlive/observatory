import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { defineConfig, type Plugin } from 'vite'

/**
 * Lists the orrery's chunk files in `orrery-preload.json` (outside `/assets/`, whose files are cached as immutable) (#168): OrreryPage,
 * OrreryRenderer and everything they import statically, three.js included. The hover and
 * idle prefetch turns them into `<link rel="modulepreload">`, which downloads and compiles
 * without running them. The names are hashed, so only the build knows them.
 */
function orreryPreloadManifest(): Plugin {
  return {
    name: 'orrery-preload-manifest',
    apply: 'build',
    generateBundle(_options, bundle) {
      const roots = Object.values(bundle).filter(
        (c) => c.type === 'chunk' && /^Orrery(Page|Renderer)$/.test(c.name),
      )
      const files = new Set<string>()
      const visit = (name: string) => {
        const chunk = bundle[name]
        if (chunk.type !== 'chunk' || chunk.isEntry || files.has(name)) return
        files.add(name)
        chunk.imports.forEach(visit)
      }
      roots.forEach((c) => {
        visit(c.fileName)
      })
      // A build with no orrery chunks would silently turn the prefetch off.
      if (roots.length !== 2)
        this.error('orrery-preload-manifest: OrreryPage/OrreryRenderer chunks not found')
      this.emitFile({
        type: 'asset',
        fileName: 'orrery-preload.json',
        source: JSON.stringify({ files: [...files].sort().map((f) => `/${f}`) }),
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), orreryPreloadManifest()],
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
