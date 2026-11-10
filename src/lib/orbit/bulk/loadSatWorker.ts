import type { SatWorker } from './satsClient'

/**
 * The satellite worker (#98), created on first use and shared. A dynamic import, so
 * neither the client nor satellite.js reaches the first load (check-bundle's
 * entry-has-no-sgp4 and entry-has-no-sat-worker rules). A worker that dies (a stale chunk
 * after a deploy, #191) is dropped, so the next call starts a new one.
 */
let worker: Promise<SatWorker> | null = null

export function loadSatWorker(): Promise<SatWorker> {
  if (worker) return worker
  const started: Promise<SatWorker> = import('./satsClient').then(({ createSatWorker }) =>
    createSatWorker(() => {
      if (worker === started) worker = null
    }),
  )
  // A failed import must not be cached either.
  started.catch(() => {
    if (worker === started) worker = null
  })
  worker = started
  return started
}
