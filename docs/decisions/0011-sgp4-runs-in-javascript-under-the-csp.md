# 0011. Production propagates satellites in JavaScript; the CSP allows no WebAssembly

Status: Accepted · Date: recorded 2026-11-08, decided earlier (measured 2026-11-07)

## Context

The satellite worker was built around satellite.js 7's `BulkPropagator`, which runs SGP4 in
WebAssembly. The site's CSP `script-src` has no `'wasm-unsafe-eval'`, so on the deployed site the
module fails to compile and the worker falls back to the JavaScript `propagate`. Measured on
2026-11-07 over all 19,540 objects, on a Mac with Chromium on the real GPU: JS took 5–11 ms a
pass on a preview, and WASM 90–122 ms in local preview (which ignores `_headers`).

## Decision

Keep the CSP as it is and let production run the JavaScript path. Don't add `'wasm-unsafe-eval'`
for SGP4. The same rule keeps Draco and meshopt decoders out of the craft models: they are decoded
at build time ([reference/orrery.md](../reference/orrery.md#spacecraft-shapes-115)).

## Consequences

- The CSP stays strict, and the faster path is the one in production.
- Local `pnpm preview` runs a different engine than production; `data-sat-engine` says which.
- The WASM path stays as code for environments without the CSP.
- Revisit if a measurement on a target phone (the iPhone 15 Pro: a pass ≤ 300 ms, frames
  ≤ 33 ms) shows the JS path missing its budget.

## Evidence

- #98; commits 8593742, 27535c6.
- `public/_headers` (`script-src`), `src/lib/orbit/bulk/`, `sats.worker.ts`.
- [reference/satellites.md](../reference/satellites.md#satellites-98).
