/**
 * The orrery's satellite catalogue format (#98): CelesTrak OMM trimmed to compact rows,
 * split into disjoint groups, read back into what satellite.js's json2satrec wants.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import * as satellite from 'satellite.js'
import { describe, expect, it } from 'vitest'

import {
  CELESTRAK_FETCH,
  EPOCH_WINDOW_MS,
  overlaySupplemental,
  rowEpochMs,
  rowToOmm,
  SAT_FIELDS,
  SAT_GROUPS,
  type SatRow,
  splitGroups,
  toRow,
} from '@/lib/orbit/satCatalog'

type Omm = Record<string, unknown>
const SAMPLES = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'celestrak-omm.json'), 'utf8'),
) as Record<string, Omm[]>
const active = SAMPLES['active'] ?? []
const byName = (name: string) => active.find((r) => r['OBJECT_NAME'] === name)

describe('toRow', () => {
  it('keeps exactly the fields in SAT_FIELDS, ids as strings', () => {
    const row = toRow(byName('ISS (ZARYA)') ?? {})
    expect(row).not.toBeNull()
    expect(row).toHaveLength(SAT_FIELDS.length)
    expect(row?.[0]).toBe('ISS (ZARYA)')
    expect(row?.[1]).toBe('25544')
    expect(row?.[2]).toBe('1998-067A')
  })

  it('keeps a six-digit catalogue number (CelesTrak ran out of five digits in 2026-07)', () => {
    expect(toRow(byName('SARAMAGO') ?? {})?.[1]).toBe('100000')
    expect(toRow(byName('STARLINK-38128') ?? {})?.[1]).toBe('100001')
  })

  it('rejects a record with a missing or non-numeric element', () => {
    const iss = byName('ISS (ZARYA)') ?? {}
    expect(toRow({ ...iss, MEAN_MOTION: undefined })).toBeNull()
    expect(toRow({ ...iss, ECCENTRICITY: 'x' })).toBeNull()
    expect(toRow({ ...iss, EPOCH: 'not a date' })).toBeNull()
    expect(toRow({ ...iss, NORAD_CAT_ID: undefined })).toBeNull()
  })
})

describe('rowToOmm', () => {
  it('round-trips through json2satrec to the same orbit as the full OMM record', () => {
    for (const name of ['ISS (ZARYA)', 'SARAMAGO', 'STARLINK-38128']) {
      const full = byName(name) as satellite.OMMJsonObject
      const row = toRow(full)
      expect(row).not.toBeNull()
      if (!row) continue
      const at = new Date(rowEpochMs(row) + 3_600_000)
      const a = satellite.propagate(satellite.json2satrec(full), at)
      const b = satellite.propagate(satellite.json2satrec(rowToOmm(row)), at)
      expect(a?.position.x).toBe(b?.position.x)
      expect(a?.position.z).toBe(b?.position.z)
    }
  })

  it('reads the epoch as UTC', () => {
    const row = toRow(byName('ISS (ZARYA)') ?? {})
    expect(row && new Date(rowEpochMs(row)).toISOString()).toBe('2026-11-06T11:57:30.503Z')
  })
})

describe('groups', () => {
  it('fetches eight CelesTrak groups; Starlink comes out of active, not its own 4.7 MB download', () => {
    expect(CELESTRAK_FETCH).toEqual([
      'active',
      'stations',
      'gps-ops',
      'weather',
      'science',
      'cosmos-2251-debris',
      'iridium-33-debris',
      'fengyun-1c-debris',
    ])
    expect(CELESTRAK_FETCH).not.toContain('starlink')
  })

  it('splits into disjoint groups: every object in exactly one', () => {
    const fetched = Object.fromEntries(
      Object.entries(SAMPLES).map(([g, recs]) => [g, recs.map(toRow).filter((r) => r !== null)]),
    )
    const split = splitGroups(fetched)
    expect(Object.keys(split).sort()).toEqual(SAT_GROUPS.map((g) => g.id).sort())
    const ids = Object.values(split).flatMap((rows) => rows.map((r) => r[1]))
    expect(new Set(ids).size).toBe(ids.length)
    const names = (g: string) => (split[g as keyof typeof split] ?? []).map((r) => r[0])
    expect(names('starlink')).toEqual(['STARLINK-38128', 'STARLINK-1008', 'STARLINK-1012'])
    expect(names('stations')).toEqual(['ISS (ZARYA)', 'FREGAT DEB'])
    // Active objects in no named group: SARAMAGO and the Calspheres.
    expect(names('other')).toEqual(['SARAMAGO', 'CALSPHERE 1', 'CALSPHERE 2'])
    expect(names('gps-ops')).toEqual(['GPS BIIR-5  (PRN 22)'])
    expect(names('cosmos-2251-debris')).toEqual(['COSMOS 2251', 'COSMOS 2251 DEB'])
  })

  it('a group whose source failed is left out, not stored empty', () => {
    const fetched = { stations: (SAMPLES['stations'] ?? []).map(toRow).filter((r) => r !== null) }
    const split = splitGroups(fetched)
    expect(Object.keys(split)).toEqual(['stations'])
  })

  it('the epoch window is three days', () => {
    expect(EPOCH_WINDOW_MS).toBe(3 * 86_400_000)
  })
})

describe('overlaySupplemental (#209)', () => {
  const row = (name: string, id: string, epoch: string, meanMotion = 15): SatRow => [
    name,
    id,
    '2020-001A',
    epoch,
    meanMotion,
    0.0001,
    53,
    10,
    20,
    30,
    0.0001,
    0,
    0,
  ]
  const gp = [
    row('STARLINK-1', '1', '2026-11-10T00:00:00'),
    row('STARLINK-2', '2', '2026-11-10T00:00:00'),
    row('STARLINK-3', '3', '2026-11-10T00:00:00'),
  ]

  it('prefers SupGP elements by NORAD id and puts them first', () => {
    const sup = [row('STARLINK-3', '3', '2026-11-11T00:00:00', 15.5)]
    const { rows, supplemental, supplementalOnly } = overlaySupplemental(gp, sup)
    expect(supplemental).toBe(1)
    expect(supplementalOnly).toBe(0)
    expect(rows.map((r) => r[1])).toEqual(['3', '1', '2'])
    expect(rows[0]?.[4]).toBe(15.5)
  })

  it('drops SupGP objects the GP slice lacks, so every object stays in one group', () => {
    const sup = [
      row('STARLINK-9', '9', '2026-11-11T00:00:00'),
      row('STARLINK-1', '1', '2026-11-11T00:00:00'),
    ]
    const { rows, supplemental, supplementalOnly } = overlaySupplemental(gp, sup)
    expect(rows).toHaveLength(3)
    expect(rows.map((r) => r[1])).not.toContain('9')
    expect(supplemental).toBe(1)
    expect(supplementalOnly).toBe(1)
  })

  it('keeps the newest epoch when SupGP lists one object twice', () => {
    const sup = [
      row('STARLINK-2', '2', '2026-11-11T06:00:00', 15.6),
      row('STARLINK-2', '2', '2026-11-11T00:00:00', 15.4),
    ]
    const { rows, supplemental } = overlaySupplemental(gp, sup)
    expect(supplemental).toBe(1)
    expect(rows[0]?.[4]).toBe(15.6)
    expect(rows).toHaveLength(3)
  })

  it('with no SupGP rows the GP slice comes back as it was', () => {
    const { rows, supplemental } = overlaySupplemental(gp, [])
    expect(rows).toEqual(gp)
    expect(supplemental).toBe(0)
  })
})
