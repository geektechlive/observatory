/**
 * The satellite propagation core for the orrery (#98), run here in Node: stored groups
 * decoded and turned into satrecs, then one pass of satellite.js 7's WASM
 * BulkPropagator per frame. Spec Part 17: a six-digit object and the ISS must match the
 * library's own JS propagate; the ±3-day epoch window is enforced.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import * as satellite from 'satellite.js'
import { describe, expect, it } from 'vitest'

import { bulkRuntime } from '@/lib/orbit/bulk/bulkEci'
import {
  buildSatField,
  decodeSatGroup,
  propagateField,
  propagateFieldJs,
  SAT_FAILED,
  SAT_OK,
  SAT_OUT_OF_WINDOW,
} from '@/lib/orbit/bulk/satField'
import { ORBIT_LEO } from '@/lib/orbit/orbitClass'
import { type SatRow, toRow } from '@/lib/orbit/satCatalog'
import { OrrerySatsSchema } from '@/schemas/orrerySats'

type Omm = Record<string, unknown>
const SAMPLES = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'celestrak-omm.json'), 'utf8'),
) as Record<string, Omm[]>
const active = SAMPLES['active'] ?? []
const full = (name: string) => active.find((r) => r['OBJECT_NAME'] === name) as Omm
const row = (name: string) => toRow(full(name)) as SatRow

const payload = (group: string, rows: SatRow[]) => ({
  group,
  label: group,
  category: 'other',
  source: 'celestrak',
  celestrakGroup: 'active',
  generatedAt: '2026-11-07T06:00:00.000Z',
  fields: [
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
  ],
  count: rows.length,
  rows,
})

const PICK = ['ISS (ZARYA)', 'SARAMAGO', 'STARLINK-38128']
// The ISS epoch is the earliest of the three (2026-11-06T11:57Z): one hour after it is
// inside every object's window.
const AT = Date.parse('2026-11-06T12:57:30Z')

describe('OrrerySatsSchema', () => {
  it('accepts a stored group and rejects an unknown group or a wrong field list', () => {
    expect(OrrerySatsSchema.safeParse(payload('other', [row('SARAMAGO')])).success).toBe(true)
    expect(OrrerySatsSchema.safeParse(payload('active', [])).success).toBe(false)
    expect(
      OrrerySatsSchema.safeParse({ ...payload('other', []), fields: ['name', 'id'] }).success,
    ).toBe(false)
  })
})

describe('decodeSatGroup', () => {
  it('reads a stored body and drops rows it cannot propagate, counting them', () => {
    const bad = ['BROKEN', '1', '', 'not a date', 1, 0, 0, 0, 0, 0, 0, 0, 0]
    const text = JSON.stringify(payload('other', [row('SARAMAGO'), bad as unknown as SatRow]))
    const decoded = decodeSatGroup(new TextEncoder().encode(text).buffer)
    expect(decoded.group).toBe('other')
    expect(decoded.rows.map((r) => r[0])).toEqual(['SARAMAGO'])
    expect(decoded.dropped).toBe(1)
  })

  it('throws on a body that is not a stored group', () => {
    expect(() => decodeSatGroup(new TextEncoder().encode('{"x":1}').buffer)).toThrow()
  })
})

describe('buildSatField', () => {
  it('keeps the groups in order with each one’s start and count', () => {
    const field = buildSatField([
      { group: 'stations', rows: [row('ISS (ZARYA)')] },
      { group: 'starlink', rows: [row('STARLINK-38128')] },
      { group: 'other', rows: [row('SARAMAGO')] },
    ])
    expect(field.count).toBe(3)
    expect(field.groups).toEqual([
      { group: 'stations', start: 0, count: 1 },
      { group: 'starlink', start: 1, count: 1 },
      { group: 'other', start: 2, count: 1 },
    ])
    expect(field.ids).toEqual(['25544', '100001', '100000'])
  })

  it('gives each object its orbit class and launch order, for the browser (#158)', () => {
    const field = buildSatField([
      { group: 'stations', rows: [row('ISS (ZARYA)')] },
      { group: 'starlink', rows: [row('STARLINK-38128')] },
    ])
    expect(field.orbit).toEqual(Uint8Array.from([ORBIT_LEO, ORBIT_LEO]))
    expect(field.launch).toHaveLength(2)
    expect(field.launch[0]).toBe(1998 * 1000 + 67)
    expect(field.launch[1]).toBeGreaterThan(2019 * 1000)
  })
})

describe('propagateField (#98, spec Part 17)', () => {
  const field = buildSatField([{ group: 'other', rows: PICK.map(row) }])

  it('matches satellite.js propagate from the full OMM record to under a kilometre', async () => {
    const { positions, status } = propagateField(await bulkRuntime(), field, AT)
    PICK.forEach((name, i) => {
      const js = satellite.propagate(
        satellite.json2satrec(full(name) as satellite.OMMJsonObject),
        new Date(AT),
      )
      expect(status[i]).toBe(SAT_OK)
      expect(js).not.toBeNull()
      const d = Math.hypot(
        (positions[i * 3] ?? 0) - (js?.position.x ?? 0),
        (positions[i * 3 + 1] ?? 0) - (js?.position.y ?? 0),
        (positions[i * 3 + 2] ?? 0) - (js?.position.z ?? 0),
      )
      expect(d).toBeLessThan(1)
    })
  })

  it('refuses a date more than three days from an object’s own epoch', async () => {
    const issEpoch = Date.parse('2026-11-06T11:57:30.503Z')
    const rt = await bulkRuntime()
    for (const at of [issEpoch + 3.5 * 86_400_000, issEpoch - 3.5 * 86_400_000]) {
      const { positions, status } = propagateField(rt, field, at)
      expect(status[0]).toBe(SAT_OUT_OF_WINDOW)
      expect(Number.isNaN(positions[0])).toBe(true)
    }
  })

  it('marks an object SGP4 cannot place as failed, never a made-up position', async () => {
    const hyperbolic = [...row('SARAMAGO')] as SatRow
    hyperbolic[5] = 1.2
    const odd = buildSatField([{ group: 'other', rows: [hyperbolic] }])
    const { positions, status } = propagateField(await bulkRuntime(), odd, AT)
    expect(status[0]).toBe(SAT_FAILED)
    expect(Number.isNaN(positions[0])).toBe(true)
  })

  it('writes into the buffers it is handed back (double buffering)', async () => {
    const rt = await bulkRuntime()
    const first = propagateField(rt, field, AT)
    const second = propagateField(rt, field, AT + 1000, first)
    expect(second.positions).toBe(first.positions)
    expect(second.status).toBe(first.status)
  })

  it('the JS fallback agrees with the WASM path', async () => {
    const wasm = propagateField(await bulkRuntime(), field, AT)
    const js = propagateFieldJs(field, AT)
    expect(Array.from(js.status)).toEqual(Array.from(wasm.status))
    for (let i = 0; i < wasm.positions.length; i++)
      expect(Math.abs((js.positions[i] ?? 0) - (wasm.positions[i] ?? 0))).toBeLessThan(0.01)
  })
})
