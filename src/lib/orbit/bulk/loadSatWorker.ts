import type { SatWorker } from './satsClient'

/**
 * The satellite worker (#98), created on first use and shared. A dynamic import, so
 * neither the client nor satellite.js reaches the first load (check-bundle's
 * entry-has-no-sgp4 and entry-has-no-sat-worker rules).
 */
let worker: Promise<SatWorker> | null = null

export function loadSatWorker(): Promise<SatWorker> {
  worker ??= import('./satsClient').then(({ createSatWorker }) => createSatWorker())
  return worker
}
