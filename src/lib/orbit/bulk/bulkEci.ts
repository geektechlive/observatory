/**
 * Many satellites at once (#97, for #98's satellite layer). satellite.js 7's
 * BulkPropagator runs SGP4 in WebAssembly over every satellite and date in one call.
 * The single-thread runtime embeds its WASM, so it needs no extra file or COOP/COEP
 * headers; it is loaded on first use with a dynamic import, never with the page.
 */
import {
  BulkPropagator,
  createSingleThreadRuntime,
  EciBaseCalculator,
  type SatRec,
} from 'satellite.js'

type Runtime = Awaited<ReturnType<typeof createSingleThreadRuntime>>

let runtime: Promise<Runtime> | null = null

/** The WASM runtime, created once and shared. */
export function bulkRuntime(): Promise<Runtime> {
  runtime ??= createSingleThreadRuntime()
  return runtime
}

/**
 * ECI positions (km, TEME) for every satellite at every date, packed as
 * [x, y, z] per satellite per date, satellite-major. A satellite SGP4 cannot place
 * (decayed, bad elements) comes back as NaN, never as a made-up position.
 */
export function propagateBulk(rt: Runtime, satrecs: SatRec[], dates: Date[]): Float32Array {
  const propagator = new BulkPropagator({
    runtime: rt,
    calculators: [new EciBaseCalculator()],
    satRecsCount: satrecs.length,
    datesCount: dates.length,
  })
  try {
    propagator.setSatRecs(satrecs)
    propagator.setDates(dates)
    propagator.run()
    const { position, error } = propagator.getRawOutput().eci
    const out = new Float32Array(position.length)
    for (let i = 0; i < error.length; i++) {
      // Any SGP4 error (SatRecError, 0 = none) leaves the slot NaN: no made-up position.
      const ok = error[i] === 0
      for (let c = 0; c < 3; c++)
        out[i * 3 + c] = ok ? (position[i * 3 + c] ?? Number.NaN) : Number.NaN
    }
    return out
  } finally {
    propagator.dispose()
  }
}
