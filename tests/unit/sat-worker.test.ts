/**
 * The satellite worker's message handling (#98), run here in Node: groups load from the
 * fetched body, and frames come back in group order with reusable buffers. SGP4 runs in
 * JS only since #137 (ADR 0011).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { SAT_OK } from '@/lib/orbit/bulk/satField'
import { createSatHandler, type SatReply } from '@/lib/orbit/bulk/satHandler'
import { createSatWorker } from '@/lib/orbit/bulk/satsClient'
import { type SatRow, toRow } from '@/lib/orbit/satCatalog'

type Omm = Record<string, unknown>
const SAMPLES = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'celestrak-omm.json'), 'utf8'),
) as Record<string, Omm[]>
const rowsOf = (g: string) => (SAMPLES[g] ?? []).map(toRow).filter((r): r is SatRow => r !== null)
const FIELDS = [
  'name',
  'id',
  'cospar',
  'epoch',
  'meanMotion',
  'eccentricity',
  'inclination',
  'raan',
  'argPericenter',
  'meanAnomaly',
  'bstar',
  'meanMotionDot',
  'meanMotionDdot',
]
const body = (group: string, rows: SatRow[]) =>
  new TextEncoder().encode(
    JSON.stringify({
      group,
      label: group,
      category: 'x',
      source: 'celestrak',
      celestrakGroup: group,
      generatedAt: '2026-11-07T06:00:00.000Z',
      fields: FIELDS,
      count: rows.length,
      rows,
    }),
  ).buffer
const AT = Date.parse('2026-11-06T12:57:30Z')

function expectType<T extends SatReply['type']>(
  reply: SatReply,
  type: T,
): Extract<SatReply, { type: T }> {
  expect(reply.type).toBe(type)
  return reply as Extract<SatReply, { type: T }>
}

describe('createSatHandler (#98)', () => {
  it('loads groups and answers a frame in load order, with each group’s span', async () => {
    const handle = createSatHandler()
    const a = expectType(
      (await handle({ type: 'load', id: 1, body: body('stations', rowsOf('stations')) })).reply,
      'loaded',
    )
    expect(a).toMatchObject({ group: 'stations', count: 2, dropped: 0 })
    const b = expectType(
      (await handle({ type: 'load', id: 2, body: body('gps-ops', rowsOf('gps-ops')) })).reply,
      'loaded',
    )
    // Names, ids and epochs cross once per change of the field, not with every frame.
    expect(b.field.groups).toEqual([
      { group: 'stations', start: 0, count: 2 },
      { group: 'gps-ops', start: 2, count: 1 },
    ])
    expect(b.field.ids).toEqual(['25544', expect.any(String), expect.any(String)])
    expect(b.field.names[0]).toBe('ISS (ZARYA)')
    expect(b.field.epochMs).toHaveLength(3)
    expect(b.field.version).toBeGreaterThan(a.field.version)
    const { reply, transfer } = await handle({ type: 'propagate', id: 3, dateMs: AT })
    const frame = expectType(reply, 'frame')
    expect(frame.version).toBe(b.field.version)
    expect(frame).not.toHaveProperty('names')
    expect(frame.positions).toHaveLength(9)
    expect(frame.status[0]).toBe(SAT_OK)
    expect(frame.engine).toBe('js')
    expect(frame.ms).toBeGreaterThanOrEqual(0)
    // The buffers are transferred, not copied.
    expect(transfer).toEqual([frame.positions.buffer, frame.status.buffer])
  })

  it('reloading a group replaces it; unloading removes it', async () => {
    const handle = createSatHandler()
    await handle({ type: 'load', id: 1, body: body('stations', rowsOf('stations')) })
    await handle({ type: 'load', id: 2, body: body('stations', rowsOf('stations').slice(0, 1)) })
    let frame = expectType((await handle({ type: 'propagate', id: 3, dateMs: AT })).reply, 'frame')
    expect(frame.positions).toHaveLength(3)
    const gone = expectType(
      (await handle({ type: 'unload', id: 4, group: 'stations' })).reply,
      'unloaded',
    )
    expect(gone.field.groups).toEqual([])
    frame = expectType((await handle({ type: 'propagate', id: 5, dateMs: AT })).reply, 'frame')
    expect(frame.version).toBe(gone.field.version)
    expect(frame.positions).toHaveLength(0)
  })

  it('writes into returned buffers rather than allocating new ones', async () => {
    const handle = createSatHandler()
    await handle({ type: 'load', id: 1, body: body('stations', rowsOf('stations')) })
    const first = expectType(
      (await handle({ type: 'propagate', id: 2, dateMs: AT })).reply,
      'frame',
    )
    const second = expectType(
      (
        await handle({
          type: 'propagate',
          id: 3,
          dateMs: AT + 1000,
          reuse: { positions: first.positions, status: first.status },
        })
      ).reply,
      'frame',
    )
    expect(second.positions).toBe(first.positions)
  })

  // #154: Space-Track's elements for the objects predicted to re-enter, loaded as an
  // extra group whatever the switches say; an object a loaded group holds is drawn once.
  it('loads re-entry rows as a group of their own, last, and drops what another group holds', async () => {
    const handle = createSatHandler()
    const stations = rowsOf('stations')
    const gps = rowsOf('gps-ops')
    const [iss] = stations
    const [navstar] = gps
    if (!iss || !navstar) throw new Error('fixture')
    const first = expectType(
      (await handle({ type: 'reentry', id: 1, rows: [iss, navstar] })).reply,
      'loaded',
    )
    expect(first).toMatchObject({ group: 'reentry', count: 2, dropped: 0 })
    expect(first.field.groups).toEqual([{ group: 'reentry', start: 0, count: 2 }])
    // The ISS now arrives in a loaded group: it wins, and the re-entry copy goes.
    const loaded = expectType(
      (await handle({ type: 'load', id: 2, body: body('stations', stations) })).reply,
      'loaded',
    )
    expect(loaded.field.groups).toEqual([
      { group: 'stations', start: 0, count: stations.length },
      { group: 'reentry', start: stations.length, count: 1 },
    ])
    expect(loaded.field.ids.filter((id) => id === iss[1])).toHaveLength(1)
    const frame = expectType(
      (await handle({ type: 'propagate', id: 3, dateMs: AT })).reply,
      'frame',
    )
    expect(frame.positions).toHaveLength((stations.length + 1) * 3)
    // Switched off again, the object comes back through the re-entry group.
    const gone = expectType(
      (await handle({ type: 'unload', id: 4, group: 'stations' })).reply,
      'unloaded',
    )
    expect(gone.field.groups).toEqual([{ group: 'reentry', start: 0, count: 2 }])
  })

  it('drops re-entry rows that are not rows, and empties the group on no rows', async () => {
    const handle = createSatHandler()
    const [iss] = rowsOf('stations')
    const reply = expectType(
      (await handle({ type: 'reentry', id: 1, rows: [iss, ['x', 1], null, 'nope'] })).reply,
      'loaded',
    )
    expect(reply).toMatchObject({ count: 1, dropped: 3 })
    const none = expectType((await handle({ type: 'reentry', id: 2, rows: [] })).reply, 'loaded')
    expect(none.field.groups).toEqual([])
  })

  it('answers a bad body with an error naming the request, not a crash', async () => {
    const handle = createSatHandler()
    const reply = (
      await handle({ type: 'load', id: 7, body: new TextEncoder().encode('nope').buffer })
    ).reply
    expect(expectType(reply, 'error').id).toBe(7)
  })
})

class FakeWorker {
  static last: FakeWorker | null = null
  onmessage: ((e: MessageEvent) => void) | null = null
  onerror: ((e: ErrorEvent) => void) | null = null
  onmessageerror: ((e: MessageEvent) => void) | null = null
  terminated = false
  posted: { msg: { type: string; id: number }; transfer: Transferable[] }[] = []
  constructor() {
    FakeWorker.last = this
  }
  postMessage(msg: { type: string; id: number }, transfer: Transferable[] = []) {
    this.posted.push({ msg, transfer })
  }
  terminate() {
    this.terminated = true
  }
  reply(data: unknown) {
    this.onmessage?.({ data } as MessageEvent)
  }
}

describe('createSatWorker (#98)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('transfers the fetched body, matches replies by id, and rejects on an error reply', async () => {
    vi.stubGlobal('Worker', FakeWorker)
    const sats = createSatWorker()
    const fake = FakeWorker.last
    const buffer = new ArrayBuffer(8)
    const loading = sats.load(buffer)
    const sent = fake?.posted[0]
    expect(sent?.msg.type).toBe('load')
    expect(sent?.transfer).toEqual([buffer])
    fake?.reply({
      type: 'loaded',
      id: sent?.msg.id,
      group: 'stations',
      count: 2,
      dropped: 0,
      ms: 1,
    })
    await expect(loading).resolves.toMatchObject({ group: 'stations', count: 2 })

    const failing = sats.load(new ArrayBuffer(1))
    fake?.reply({ type: 'error', id: fake.posted[1]?.msg.id, message: 'bad body' })
    await expect(failing).rejects.toThrow('bad body')
  })

  it.each(['onerror', 'onmessageerror'] as const)(
    'rejects every pending request when the worker fires %s, and refuses later ones (#191)',
    async (handler) => {
      vi.stubGlobal('Worker', FakeWorker)
      const onFail = vi.fn()
      const sats = createSatWorker(onFail)
      const fake = FakeWorker.last
      const loading = sats.load(new ArrayBuffer(1))
      const passing = sats.propagate(new Date(AT))
      fake?.[handler]?.({} as never)
      await expect(loading).rejects.toThrow(/worker/i)
      await expect(passing).rejects.toThrow(/worker/i)
      expect(sats.failed).toBe(true)
      expect(fake?.terminated).toBe(true)
      expect(onFail).toHaveBeenCalledTimes(1)
      await expect(sats.load(new ArrayBuffer(1))).rejects.toThrow(/worker/i)
    },
  )

  it('starts a new worker on the next loadSatWorker after one failed (#191)', async () => {
    vi.stubGlobal('Worker', FakeWorker)
    const { loadSatWorker } = await import('@/lib/orbit/bulk/loadSatWorker')
    const first = await loadSatWorker()
    expect(await loadSatWorker()).toBe(first)
    FakeWorker.last?.onerror?.({} as ErrorEvent)
    const second = await loadSatWorker()
    expect(second).not.toBe(first)
  })

  it('hands a released frame back to the worker with the next request (double buffering)', async () => {
    vi.stubGlobal('Worker', FakeWorker)
    const sats = createSatWorker()
    const fake = FakeWorker.last
    const frame = { positions: new Float32Array(3), status: new Uint8Array(1) }
    sats.release(frame)
    void sats.propagate(new Date(AT))
    const sent = fake?.posted[0]
    expect(sent?.msg).toMatchObject({ type: 'propagate', dateMs: AT, reuse: frame })
    expect(sent?.transfer).toEqual([frame.positions.buffer, frame.status.buffer])
  })
})
