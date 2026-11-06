/// <reference lib="webworker" />
/**
 * Bulk SGP4 off the main thread (#97 spike for #98). Receives TLEs and dates, answers
 * with the packed ECI positions (see propagateBulk), transferred, not copied.
 */
import { twoline2satrec } from 'satellite.js'

import { bulkRuntime, propagateBulk } from './bulkEci'

export interface BulkRequest {
  id: number
  tles: { line1: string; line2: string }[]
  /** Epoch milliseconds. */
  dates: number[]
}

export interface BulkResponse {
  id: number
  positions: Float32Array
  ms: number
}

const scope = self as unknown as DedicatedWorkerGlobalScope

scope.onmessage = (event: MessageEvent<BulkRequest>) => {
  const { id, tles, dates } = event.data
  void bulkRuntime().then((rt) => {
    const started = performance.now()
    const satrecs = tles.map((t) => twoline2satrec(t.line1, t.line2))
    const positions = propagateBulk(
      rt,
      satrecs,
      dates.map((d) => new Date(d)),
    )
    const reply: BulkResponse = { id, positions, ms: performance.now() - started }
    scope.postMessage(reply, [positions.buffer])
  })
}
