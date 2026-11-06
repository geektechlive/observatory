/**
 * The bulk SGP4 worker's main-thread side (#97): requests and answers are matched by
 * id, so two overlapping calls each get their own positions.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { BulkRequest } from '@/lib/orbit/bulk/bulk.worker'
import { createBulkWorker } from '@/lib/orbit/bulk/bulkClient'

class FakeWorker {
  static last: FakeWorker | null = null
  onmessage: ((e: MessageEvent) => void) | null = null
  posted: BulkRequest[] = []
  terminated = false
  constructor() {
    FakeWorker.last = this
  }
  postMessage(req: BulkRequest) {
    this.posted.push(req)
  }
  terminate() {
    this.terminated = true
  }
  /** Answer a request with one position per TLE: x = the request id. */
  answer(req: BulkRequest) {
    const positions = new Float32Array(req.tles.length * 3).fill(req.id)
    this.onmessage?.({ data: { id: req.id, positions, ms: 1 } } as MessageEvent)
  }
}

describe('createBulkWorker (#97)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends dates as epoch ms and matches each answer to its request', async () => {
    vi.stubGlobal('Worker', FakeWorker)
    const bulk = createBulkWorker()
    const fake = FakeWorker.last
    const tle = { line1: 'a', line2: 'b' }
    const first = bulk.propagate([tle], [new Date(1000)])
    const second = bulk.propagate([tle, tle], [new Date(2000)])
    const [r1, r2] = fake?.posted ?? []
    expect(r1?.dates).toEqual([1000])
    // Answer out of order.
    if (r2) fake?.answer(r2)
    if (r1) fake?.answer(r1)
    expect((await first).positions).toEqual(new Float32Array(3).fill(r1?.id ?? -1))
    expect((await second).positions).toHaveLength(6)
    bulk.terminate()
    expect(fake?.terminated).toBe(true)
  })
})
