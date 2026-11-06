/**
 * Main-thread side of the bulk SGP4 worker (#97 spike for #98). One request at a time
 * per worker; the answer's buffer is transferred to the caller.
 */
import type { BulkRequest, BulkResponse } from './bulk.worker'

export interface BulkWorker {
  propagate(tles: BulkRequest['tles'], dates: Date[]): Promise<BulkResponse>
  terminate(): void
}

export function createBulkWorker(): BulkWorker {
  const worker = new Worker(new URL('./bulk.worker.ts', import.meta.url), { type: 'module' })
  let next = 0
  const pending = new Map<number, (r: BulkResponse) => void>()
  worker.onmessage = (event: MessageEvent<BulkResponse>) => {
    pending.get(event.data.id)?.(event.data)
    pending.delete(event.data.id)
  }
  return {
    propagate(tles, dates) {
      const id = ++next
      return new Promise((resolve) => {
        pending.set(id, resolve)
        const request: BulkRequest = { id, tles, dates: dates.map((d) => d.getTime()) }
        worker.postMessage(request)
      })
    },
    terminate() {
      worker.terminate()
    },
  }
}
