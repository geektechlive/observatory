/**
 * The satellite layer's controller (#98): groups are fetched only when switched on and
 * only once the Earth frame is open, the worker runs at the display's cadence, frames
 * computed for an older field are dropped, and switching a group off unloads it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SAT_OK, SAT_OUT_OF_WINDOW } from '@/lib/orbit/bulk/satField'
import type { SatFieldInfo } from '@/lib/orbit/bulk/satHandler'
import type { SatFrameReply, SatLoaded, SatUnloaded, SatWorker } from '@/lib/orbit/bulk/satsClient'
import type { SatFieldGroup, SatGroupId } from '@/lib/orbit/satCatalog'
import { SatController, type SatSource } from '@/lib/orrery/satController'

const T0 = Date.parse('2026-11-07T12:00:00Z')

function info(version: number, groups: { group: SatFieldGroup; count: number }[]): SatFieldInfo {
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
    orbit: new Uint8Array(start),
    launch: new Int32Array(start),
  }
}

/** A fake worker that loads instantly and answers propagate when told to. */
class FakeWorker implements SatWorker {
  loaded: SatFieldGroup[] = []
  version = 0
  counts = new Map<SatFieldGroup, number>()
  propagations: { date: Date; resolve: (f: SatFrameReply) => void }[] = []
  released = 0
  failed = false
  private field(): SatFieldInfo {
    return info(
      this.version,
      // Like the real worker: the re-entry objects come last.
      [
        ...this.loaded.filter((g) => g !== 'reentry'),
        ...this.loaded.filter((g) => g === 'reentry'),
      ].map((g) => ({ group: g, count: this.counts.get(g) ?? 1 })),
    )
  }
  reentryLoads: unknown[][] = []
  loadReentry(rows: unknown[]): Promise<SatLoaded> {
    this.reentryLoads.push(rows)
    this.counts.set('reentry', rows.length)
    if (rows.length === 0) this.loaded = this.loaded.filter((g) => g !== 'reentry')
    else if (!this.loaded.includes('reentry')) this.loaded.push('reentry')
    this.version += 1
    return Promise.resolve({
      type: 'loaded',
      id: 0,
      group: 'reentry',
      count: rows.length,
      dropped: 0,
      ms: 1,
      field: this.field(),
    })
  }
  load(body: ArrayBuffer): Promise<SatLoaded> {
    const group = new TextDecoder().decode(body) as SatFieldGroup
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
  unload(group: SatFieldGroup): Promise<SatUnloaded> {
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
      engine: 'js',
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

describe('SatController: re-entry objects (#154)', () => {
  const ROWS = [
    ['STARLINK-4598', '53630'],
    ['CSS', '48274'],
  ]

  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('loads the re-entry rows once the Earth frame is open, with every switch off, and fetches no group', async () => {
    const { ctl, worker, fetched } = setup()
    ctl.setReentryRows(ROWS)
    ctl.tick({ near: false, cadenceMs: 1000, simMs: T0, wallMs: 0 })
    await flush()
    expect(worker.reentryLoads).toEqual([])
    ctl.tick({ near: true, cadenceMs: 1000, simMs: T0, wallMs: 0 })
    await flush()
    expect(worker.reentryLoads).toEqual([ROWS])
    expect(fetched).toEqual([])
    // Asked again with the same rows, nothing more is sent.
    ctl.setReentryRows([...ROWS])
    ctl.tick({ near: true, cadenceMs: 1000, simMs: T0, wallMs: 10 })
    await flush()
    expect(worker.reentryLoads).toHaveLength(1)
  })

  it('counts only the satellites of the switched-on groups, not the re-entry objects', async () => {
    const { ctl, worker } = setup()
    ctl.setEnabled(new Set<SatGroupId>(['stations']))
    ctl.setReentryRows(ROWS)
    ctl.tick({ near: true, cadenceMs: 1000, simMs: T0, wallMs: 0 })
    await flush()
    ctl.tick({ near: true, cadenceMs: 1000, simMs: T0, wallMs: 0 })
    worker.answer()
    await flush()
    expect(ctl.field()?.ids).toHaveLength(3)
    expect(ctl.snapshot().total).toBe(1)
    expect(ctl.snapshot().drawn).toBe(1)
  })

  it('replaces the rows when they change, and unloads them when there are none', async () => {
    const { ctl, worker } = setup()
    ctl.setReentryRows(ROWS)
    ctl.tick({ near: true, cadenceMs: 1000, simMs: T0, wallMs: 0 })
    await flush()
    ctl.setReentryRows(ROWS.slice(0, 1))
    ctl.tick({ near: true, cadenceMs: 1000, simMs: T0, wallMs: 10 })
    await flush()
    expect(worker.reentryLoads.at(-1)).toEqual(ROWS.slice(0, 1))
    ctl.setReentryRows([])
    ctl.tick({ near: true, cadenceMs: 1000, simMs: T0, wallMs: 20 })
    await flush()
    expect(worker.loaded).toEqual([])
  })

  it('sends the rows again after the worker answered with an error but stayed alive', async () => {
    const { ctl, worker } = setup()
    const real = worker.loadReentry.bind(worker)
    let calls = 0
    worker.loadReentry = (rows) => {
      calls += 1
      return calls === 1 ? Promise.reject(new Error('bad rows')) : real(rows)
    }
    ctl.setReentryRows(ROWS)
    ctl.tick({ near: true, cadenceMs: 1000, simMs: T0, wallMs: 0 })
    await flush()
    ctl.tick({ near: true, cadenceMs: 1000, simMs: T0, wallMs: 10 })
    await flush()
    expect(calls).toBe(2)
    expect(worker.reentryLoads).toEqual([ROWS])
  })

  it('sends the rows again to a new worker after the first one died', async () => {
    const { ctl, worker } = setup()
    ctl.setReentryRows(ROWS)
    ctl.tick({ near: true, cadenceMs: 1000, simMs: T0, wallMs: 0 })
    await flush()
    worker.failed = true
    worker.reentryLoads = []
    worker.loaded = []
    ctl.tick({ near: true, cadenceMs: 1000, simMs: T0, wallMs: 10 })
    await flush()
    expect(worker.reentryLoads).toEqual([ROWS])
  })
})

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

  // #206: Look closer detaches the orrery, so no drawn frame ticks the controller while it
  // is open. A field that changes then (a later group landing) must still get a pass, or
  // every satellite's position stays null and the inspector says "No position".
  describe('without a tick after the field changes (#206)', () => {
    /** Load `first`, then switch `second` on and tick once: its load is the last event. */
    async function secondGroupLands(first: SatGroupId, second: SatGroupId) {
      const s = setup()
      s.ctl.setEnabled(new Set<SatGroupId>([first]))
      s.ctl.tick({ near: true, cadenceMs: 1000, simMs: T0, wallMs: 0 })
      await flush()
      s.ctl.tick({ near: true, cadenceMs: 1000, simMs: T0, wallMs: 0 })
      expect(s.worker.propagations).toHaveLength(1)
      return {
        ...s,
        enableSecond: (simMs = T0) => {
          s.ctl.setEnabled(new Set<SatGroupId>([first, second]))
          s.ctl.tick({ near: true, cadenceMs: 1000, simMs, wallMs: 10 })
        },
      }
    }

    it('asks again when a stale pass comes back after the last tick', async () => {
      const { ctl, worker, enableSecond } = await secondGroupLands('stations', 'science')
      // The pass for the old field is still in flight when the new group lands.
      enableSecond()
      await flush()
      expect(ctl.frame()).toBeNull()
      // No tick from here on: the view is open and the orrery is detached.
      worker.answer(SAT_OK, worker.version - 1)
      await flush()
      expect(worker.propagations).toHaveLength(1)
      worker.answer()
      await flush()
      expect(ctl.frame()?.status[1]).toBe(SAT_OK)
    })

    it('asks for a pass when a group lands with no pass in flight', async () => {
      const { ctl, worker, enableSecond } = await secondGroupLands('stations', 'science')
      worker.answer()
      await flush()
      expect(ctl.frame()).not.toBeNull()
      enableSecond()
      await flush()
      expect(worker.propagations).toHaveLength(1)
      worker.answer()
      await flush()
      expect(ctl.frame()?.status[1]).toBe(SAT_OK)
    })

    it('passes at the last tick’s date, never a later one', async () => {
      const { worker, enableSecond } = await secondGroupLands('stations', 'science')
      worker.answer()
      await flush()
      // The clock moved a minute; the cadence holds that tick's own pass back.
      enableSecond(T0 + 60_000)
      expect(worker.propagations).toHaveLength(0)
      await flush()
      expect(worker.propagations).toHaveLength(1)
      expect(worker.propagations[0]?.date.getTime()).toBe(T0 + 60_000)
    })

    it('asks nothing once the Earth frame was closed at the last tick', async () => {
      const { ctl, worker, enableSecond } = await secondGroupLands('stations', 'science')
      enableSecond()
      // The camera pulls away from Earth before the group lands.
      ctl.tick({ near: false, cadenceMs: null, simMs: T0, wallMs: 20 })
      await flush()
      worker.answer(SAT_OK, worker.version - 1)
      await flush()
      expect(ctl.field()?.ids).toHaveLength(2)
      expect(worker.propagations).toHaveLength(0)
    })

    it('asks nothing after dispose', async () => {
      const { ctl, worker, enableSecond } = await secondGroupLands('stations', 'science')
      enableSecond()
      await flush()
      ctl.dispose()
      worker.answer(SAT_OK, worker.version - 1)
      await flush()
      expect(worker.propagations).toHaveLength(0)
    })
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

  it('shows error when the worker dies, and a toggle starts a fresh worker (#191)', async () => {
    const dead = new FakeWorker()
    dead.load = () => {
      dead.failed = true
      return Promise.reject(new Error('The satellite worker failed'))
    }
    const fresh = new FakeWorker()
    const workers = [dead, fresh]
    const start = vi.fn(() => Promise.resolve(workers.shift() ?? fresh))
    const ctl = new SatController(
      {
        fetchGroup: (group) =>
          Promise.resolve({
            body: new TextEncoder().encode(group).buffer,
            degraded: false,
            dataAgeSeconds: 0,
          }),
        worker: start,
      },
      () => undefined,
    )
    const tick = () => {
      ctl.tick({ near: true, cadenceMs: 1000, simMs: T0, wallMs: 0 })
    }
    ctl.setEnabled(new Set<SatGroupId>(['stations']))
    tick()
    await flush()
    expect(ctl.snapshot().groups.stations?.status).toBe('error')

    ctl.setEnabled(new Set<SatGroupId>())
    ctl.setEnabled(new Set<SatGroupId>(['stations']))
    tick()
    await flush()
    expect(start).toHaveBeenCalledTimes(2)
    expect(ctl.snapshot().groups.stations?.status).toBe('loaded')
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
