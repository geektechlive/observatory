/**
 * SGP4 on first use, not with the page (#97). satellite.js costs ~11 kB of gzip, so
 * the ISS and satellite hooks import the propagation module when they mount (ISS) or
 * get orbit data (satellites), never as part of the page's first-load chunks. The ISS
 * import runs alongside its TLE fetch.
 */
import type * as Propagate from './propagate'

export type PropagateModule = typeof Propagate

let loaded: PropagateModule | null = null
let loading: Promise<PropagateModule> | null = null

/** The propagation module, imported once and shared. */
export function loadPropagate(): Promise<PropagateModule> {
  loading ??= import('./propagate').then((m) => {
    loaded = m
    return m
  })
  return loading
}

/** The module if an earlier import already landed, so a new consumer starts with it. */
export function loadedPropagate(): PropagateModule | null {
  return loaded
}
