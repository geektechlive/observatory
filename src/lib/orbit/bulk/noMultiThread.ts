/**
 * Stand-in for satellite.js's multi-thread WASM build (#97), swapped in by the
 * `#wasm-multi-thread` alias in vite.config.ts. That build uses top-level await and
 * needs cross-origin isolation (COOP/COEP), which this site does not send; merely
 * being in the module graph split the page's first-load code into ~18 chunks.
 * We use the single-thread runtime only.
 */
export default function createWasmModuleMultiThread(): never {
  throw new Error('satellite.js multi-thread runtime is not bundled; use createSingleThreadRuntime')
}
