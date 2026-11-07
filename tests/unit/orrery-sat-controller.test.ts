/**
 * The satellite layer's controller (#98): groups are fetched only when switched on and
 * only once the Earth frame is open, the worker runs at the display's cadence, frames
 * computed for an older field are dropped, and switching a group off unloads it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SAT_OK, SAT_OUT_OF_WINDOW } from '@/lib/orbit/bulk/satField'
import type { SatFieldInfo } from '@/lib/orbit/bulk/satHandler'
import type { SatFrameReply, SatLoaded, SatUnloaded, SatWorker } from '@/lib/orbit/bulk/satsClient'
import type { SatGroupId } from '@/lib/orbit/satCatalog'
import { SatController, type SatSource } from '@/lib/orrery/satController'

const T0 = Date.parse('2026-11-07T12:00:00Z')

function info(version: number, groups: { group: SatGroupId; count: number }[]): SatFieldInfo {
  let start = 0
  const spans = groups.map((g) => {
    const span = { group: g.group, start, count: g.count }
    start += g.count
    return span
  })
  return {
    version,
    groups: spans,
    ids: Array.from({ length: start }, (_, i) => String(25544 + i)),
    names: Array.from({ length: start }, (_, i) => (i === 0 ? 'ISS (ZARYA)' : `SAT ${String(i)}`)),
    epochMs: new Float64Array(start).fill(T0),
  }
}

/** A fake worker that loads instantly and answers propagate when told to. */
class FakeWorker implements SatWorker {
  loaded: SatGroupId[] = []
  version = 0
  counts = new Map<SatGroupId, number>()
  propagations: { date: Date; resolve: (f: SatFrameReply) => void }[] = []
  released = 0
  private field(): SatFieldInfo {
    return info(
      this.version,
      this.loaded.map((g) => ({ group: g, count: this.counts.get(g) ?? 1 })),
    )
  }
  load(body: ArrayBuffer): Promise<SatLoaded> {
    const group = new TextDecoder().decode(body) as SatGroupId
    if (!this.loaded.includes(group)) this.loaded.push(group)
    this.version += 1
    return Promise.resolve({
      type: 'loaded',
      id: 0,
      group,
      count: this.counts.get(group) ?? 1,
      dropped: 0,
      ms: 1,
      field: this.field(),
    })
  }
  unload(group: SatGroupId): Promise<SatUnloaded> {
    this.loaded = this.loaded.filter((g) => g !== group)
    this.version += 1
    return Promise.resolve({ type: 'unloaded', id: 0, group, field: this.field() })
  }
  propagate(date: Date): Promise<SatFrameReply> {
    return new Promise((resolve) => this.propagations.push({ date, resolve }))
  }
  /** Answer the oldest propagate for the current field, every object with `status`. */
  answer(status = SAT_OK, version = this.version): void {
    const p = this.propagations.shift()
    const n = this.loaded.reduce((s, g) => s + (this.counts.get(g) ?? 1), 0)
    p?.resolve({
      type: 'frame',
      id: 0,
      dateMs: p.date.getTime(),
      version,
      positions: new Float32Array(n * 3).fill(7000),
      status: new Uint8Array(n).fill(status),
      ms: 12,
      engine: 'wasm',
    })
  }
  release(): void {
    this.released += 1
  }
  terminate(): void {
    return undefined
  }
}

function setup() {
  const worker = new FakeWorker()
  const fetched: SatGroupId[] = []
  const source: SatSource = {
    fetchGroup: (group) => {
      fetched.push(group)
      return Promise.resolve({
        body: new TextEncoder().encode(group).buffer,
        degraded: false,
        dataAgeSeconds: 3600,
      })
    },
    worker: () => Promise.resolve(worker),
  }
  const changes = vi.fn()
  const ctl = new SatController(source, changes)
  return { worker, fetched, ctl, changes }
}

const flush = async () => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve()
}

describe('SatController (#98)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('fetches nothing while the Earth frame is closed, then only the groups switched on', async () => {
    const { ctl, fetched } = setup()
    ctl.setEnabled(new Set<SatGroupId>(['stations', 'gps-ops']))
    ctl.tick({ near: false, cadenceMs: null, simMs: T0, wallMs: 0 })
    await flush()
    expect(fetched).toEqual([])
    ctl.tick({ near: true, cadenceMs: 1000, simMs: T0, wallMs: 0 })
    await flush()
    expect(fetched).toEqual(['stations', 'gps-ops'])
    expect(ctl.snapshot().groups.stations?.status).toBe('loaded')
    expect(ctl.snapshot().groups.starlink?.status).toBe('off')
  })

  it('runs the worker at the cadence and keeps the newest frame', async () => {
    const { ctl, worker, changes } = setup()
    ctl.setEnabled(new Set<SatGroupId>(['stations']))
    ctl.tick({ near: true, cadenceMs: 1000, simMs: T0, wallMs: 0 })
    await flush()
    ctl.tick({ near: true, cadenceMs: 1000, simMs: T0, wallMs: 10 })
    expect(worker.propagations).toHaveLength(1)
    worker.answer()
    await flush()
    expect(ctl.frame()?.status[0]).toBe(SAT_OK)
    expect(changes).toHaveBeenCalled()
    // Inside the cadence: no new pass, even though the clock moved.
    ctl.tick({ near: true, cadenceMs: 1000, simMs: T0 + 500, wallMs: 500 })
    expect(worker.propagations).toHaveLength(0)
    ctl.tick({ near: true, cadenceMs: 1000, simMs: T0 + 1500, wallMs: 1500 })
    expect(worker.propagations).toHaveLength(1)
    worker.answer()
    await flush()
    // The frame it replaced goes back to the worker for reuse.
    expect(worker.released).toBe(1)
  })

  it('does not pass again while the clock stands still', async () => {
    const { ctl, worker } = setup()
    ctl.setEnabled(new Set<SatGroupId>(['stations']))
    ctl.tick({ near: true, cadenceMs: 1000, simMs: T0, wallMs: 0 })
    await flush()
    ctl.tick({ near: true, cadenceMs: 1000, simMs: T0, wallMs: 0 })
    worker.answer()
    await flush()
    ctl.tick({ near: true, cadenceMs: 1000, simMs: T0, wallMs: 5000 })
    expect(worker.propagations).toHaveLength(0)
  })

  it('wakes the renderer when a pass held back by the cadence falls due', async () => {
    const { ctl, worker, changes } = setup()
    ctl.setEnabled(new Set<SatGroupId>(['stations']))
    ctl.tick({ near: true, cadenceMs: 1000, simMs: T0, wallMs: 0 })
    await flush()
    ctl.tick({ near: true, cadenceMs: 1000, simMs: T0, wallMs: 0 })
    worker.answer()
    await flush()
    changes.mockClear()
    // A scrub while paused: the next pass is due in 800 ms.
    ctl.tick({ near: true, cadenceMs: 1000, simMs: T0 + 86_400_000, wallMs: 200 })
    expect(worker.propagations).toHaveLength(0)
    vi.advanceTimersByTime(800)
    expect(changes).toHaveBeenCalled()
  })

  it('drops a frame computed for an older field and asks again', async () => {
    const { ctl, worker } = setup()
    ctl.setEnabled(new Set<SatGroupId>(['stations']))
    ctl.tick({ near: true, cadenceMs: 1000, simMs: T0, wallMs: 0 })
    await flush()
    ctl.tick({ near: true, cadenceMs: 1000, simMs: T0, wallMs: 0 })
    worker.answer(SAT_OK, worker.version - 1)
    await flush()
    expect(ctl.frame()).toBeNull()
    ctl.tick({ near: true, cadenceMs: 1000, simMs: T0, wallMs: 10 })
    expect(worker.propagations).toHaveLength(1)
  })

  it('stops the worker in the haze but gives the haze one pass to show', async () => {
    const { ctl, worker } = setup()
    ctl.setEnabled(new Set<SatGroupId>(['stations']))
    ctl.tick({ near: true, cadenceMs: null, simMs: T0, wallMs: 0 })
    await flush()
    ctl.tick({ near: true, cadenceMs: null, simMs: T0, wallMs: 0 })
    expect(worker.propagations).toHaveLength(1)
    worker.answer()
    await flush()
    ctl.tick({ near: true, cadenceMs: null, simMs: T0 + 60_000, wallMs: 10_000 })
    expect(worker.propagations).toHaveLength(0)
  })

  it('counts objects hidden for being outside their epoch window', async () => {
    const { ctl, worker } = setup()
    worker.counts.set('stations', 3)
    ctl.setEnabled(new Set<SatGroupId>(['stations']))
    ctl.tick({ near: true, cadenceMs: 1000, simMs: T0, wallMs: 0 })
    await flush()
    ctl.tick({ near: true, cadenceMs: 1000, simMs: T0, wallMs: 0 })
    worker.answer(SAT_OUT_OF_WINDOW)
    await flush()
    expect(ctl.snapshot()).toMatchObject({ drawn: 0, outOfWindow: 3, total: 3 })
  })

  it('unloads a group switched off, and fetches it again when switched back on', async () => {
    const { ctl, worker, fetched } = setup()
    ctl.setEnabled(new Set<SatGroupId>(['stations']))
    ctl.tick({ near: true, cadenceMs: 1000, simMs: T0, wallMs: 0 })
    await flush()
    ctl.setEnabled(new Set<SatGroupId>())
    ctl.tick({ near: true, cadenceMs: 1000, simMs: T0, wallMs: 10 })
    await flush()
    expect(worker.loaded).toEqual([])
    expect(ctl.field()?.groups).toEqual([])
    ctl.setEnabled(new Set<SatGroupId>(['stations']))
    ctl.tick({ near: true, cadenceMs: 1000, simMs: T0, wallMs: 20 })
    await flush()
    expect(fetched).toEqual(['stations', 'stations'])
  })

  it('reports a failed fetch for that group and leaves the others', async () => {
    const worker = new FakeWorker()
    const ctl = new SatController(
      {
        fetchGroup: (group) =>
          group === 'starlink'
            ? Promise.reject(new Error('503'))
            : Promise.resolve({
                body: new TextEncoder().encode(group).buffer,
                degraded: false,
                dataAgeSeconds: 0,
              }),
        worker: () => Promise.resolve(worker),
      },
      () => undefined,
    )
    ctl.setEnabled(new Set<SatGroupId>(['stations', 'starlink']))
    ctl.tick({ near: true, cadenceMs: 1000, simMs: T0, wallMs: 0 })
    await flush()
    const s = ctl.snapshot()
    expect(s.groups.starlink?.status).toBe('error')
    expect(s.groups.stations?.status).toBe('loaded')
  })
})
