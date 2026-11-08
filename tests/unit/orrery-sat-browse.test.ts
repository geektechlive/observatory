/**
 * The satellite browser's lists, sorts and filter (#158), over a small field and a
 * synthetic 19,500-object one for the per-keystroke cost.
 */
import { describe, expect, it } from 'vitest'

import { launchOrder, ORBIT_GEO, ORBIT_HEO, ORBIT_LEO, ORBIT_MEO } from '@/lib/orbit/orbitClass'
import type { SatGroupId } from '@/lib/orbit/satCatalog'
import {
  browse,
  type BrowseField,
  buildBrowseIndex,
  countryOptions,
  DEFAULT_BROWSE_LIMIT,
  groupCounts,
  type SatcatLite,
} from '@/lib/orrery/satBrowse'

interface Obj {
  id: string
  name: string
  group: SatGroupId
  orbit: number
  cospar: string
}

function fieldOf(objs: Obj[], version = 1): BrowseField {
  const groups: { group: SatGroupId; start: number; count: number }[] = []
  objs.forEach((o, i) => {
    const last = groups[groups.length - 1]
    if (last && last.group === o.group) last.count += 1
    else groups.push({ group: o.group, start: i, count: 1 })
  })
  return {
    version,
    groups,
    ids: objs.map((o) => o.id),
    names: objs.map((o) => o.name),
    orbit: Uint8Array.from(objs.map((o) => o.orbit)),
    launch: Int32Array.from(objs.map((o) => launchOrder(o.cospar))),
  }
}

const OBJS: Obj[] = [
  { id: '25544', name: 'ISS (ZARYA)', group: 'stations', orbit: ORBIT_LEO, cospar: '1998-067A' },
  { id: '48274', name: 'CSS (TIANHE)', group: 'stations', orbit: ORBIT_LEO, cospar: '2021-035A' },
  { id: '40001', name: 'GPS BIIF-1', group: 'gps-ops', orbit: ORBIT_MEO, cospar: '2010-022A' },
  { id: '41001', name: 'GOES 16', group: 'weather', orbit: ORBIT_GEO, cospar: '2016-071A' },
  { id: '43001', name: 'MOLNIYA 3-50', group: 'other', orbit: ORBIT_HEO, cospar: '2001-005A' },
  { id: '100000', name: 'SARAMAGO', group: 'other', orbit: ORBIT_LEO, cospar: '2026-120A' },
]
const index = buildBrowseIndex(fieldOf(OBJS))
const names = (r: { rows: { name: string }[] }) => r.rows.map((x) => x.name)

describe('browse', () => {
  it('lists everything in field order with no list or text', () => {
    const r = browse(index, { list: { list: 'all' }, text: '' })
    expect(r.total).toBe(6)
    expect(names(r)).toEqual(OBJS.map((o) => o.name))
  })

  it('lists one kind by its groups', () => {
    const r = browse(index, { list: { list: 'group', groups: ['stations'] }, text: '' })
    expect(names(r)).toEqual(['ISS (ZARYA)', 'CSS (TIANHE)'])
  })

  it('lists an orbit class', () => {
    expect(names(browse(index, { list: { list: 'orbit', orbit: ORBIT_GEO }, text: '' }))).toEqual([
      'GOES 16',
    ])
    expect(names(browse(index, { list: { list: 'orbit', orbit: ORBIT_LEO }, text: '' }))).toEqual([
      'ISS (ZARYA)',
      'CSS (TIANHE)',
      'SARAMAGO',
    ])
  })

  it('puts the newest launches first', () => {
    const r = browse(index, { list: { list: 'newest' }, text: '' })
    expect(names(r).slice(0, 3)).toEqual(['SARAMAGO', 'CSS (TIANHE)', 'GOES 16'])
  })

  it('filters by name, ignoring case, and by NORAD id prefix', () => {
    expect(names(browse(index, { list: { list: 'all' }, text: 'goes' }))).toEqual(['GOES 16'])
    expect(names(browse(index, { list: { list: 'all' }, text: '  ZARYA ' }))).toEqual([
      'ISS (ZARYA)',
    ])
    expect(names(browse(index, { list: { list: 'all' }, text: '1000' }))).toEqual(['SARAMAGO'])
  })

  it('combines a list with the text filter', () => {
    const r = browse(index, { list: { list: 'orbit', orbit: ORBIT_LEO }, text: 'tian' })
    expect(names(r)).toEqual(['CSS (TIANHE)'])
  })

  it('caps the rows and says how many more there are', () => {
    const many = Array.from({ length: 250 }, (_, i) => ({
      id: String(60000 + i),
      name: `OBJ ${String(i)}`,
      group: 'other' as const,
      orbit: ORBIT_LEO,
      cospar: '2024-001A',
    }))
    const r = browse(buildBrowseIndex(fieldOf(many)), { list: { list: 'all' }, text: '' })
    expect(r.rows).toHaveLength(DEFAULT_BROWSE_LIMIT)
    expect(r.total).toBe(250)
  })

  describe('with the Space-Track catalogue', () => {
    const satcat: SatcatLite = new Map([
      ['25544', { country: 'ISS', rcs: 'LARGE' }],
      ['48274', { country: 'PRC', rcs: 'LARGE' }],
      ['40001', { country: 'US', rcs: 'MEDIUM' }],
      ['41001', { country: 'US', rcs: 'LARGE' }],
      ['43001', { country: 'CIS', rcs: 'SMALL' }],
    ])

    it('sorts the largest on radar first, then medium, and leaves out the unknown', () => {
      const r = browse(index, { list: { list: 'radar' }, text: '', satcat })
      expect(names(r)).toEqual([
        'CSS (TIANHE)',
        'GOES 16',
        'ISS (ZARYA)',
        'GPS BIIF-1',
        'MOLNIYA 3-50',
      ])
    })

    it('lists one owner', () => {
      const r = browse(index, { list: { list: 'owner', country: 'US' }, text: '', satcat })
      expect(names(r)).toEqual(['GPS BIIF-1', 'GOES 16'])
    })

    it('counts owners among the loaded satellites, most first', () => {
      expect(countryOptions(index, satcat)).toEqual([
        { code: 'US', count: 2 },
        { code: 'CIS', count: 1 },
        { code: 'ISS', count: 1 },
        { code: 'PRC', count: 1 },
      ])
    })

    it('lists nothing for radar or owner until the catalogue has loaded', () => {
      expect(browse(index, { list: { list: 'radar' }, text: '' }).total).toBe(0)
    })
  })

  describe('re-entries', () => {
    const reentries = new Map([
      ['48274', { decayMs: Date.parse('2026-11-12T00:00:00Z') }],
      ['25544', { decayMs: Date.parse('2026-11-10T00:00:00Z') }],
      ['99999', { decayMs: Date.parse('2026-11-09T00:00:00Z') }],
    ])
    const reentryNames = { '99999': 'FALCON 9 R/B' }

    it('lists the soonest first, with the ones the orrery does not carry marked', () => {
      const r = browse(index, { list: { list: 'reentry' }, text: '', reentries, reentryNames })
      expect(r.rows.map((x) => [x.name, x.drawn])).toEqual([
        ['FALCON 9 R/B', false],
        ['ISS (ZARYA)', true],
        ['CSS (TIANHE)', true],
      ])
      expect(r.total).toBe(3)
    })

    it('names an undrawn object by id when Space-Track gave no name', () => {
      const r = browse(index, {
        list: { list: 'reentry' },
        text: '',
        reentries,
        reentryNames: {},
      })
      expect(r.rows[0]?.name).toBe('Object 99999')
    })
  })
})

describe('groupCounts', () => {
  it('counts the objects per group', () => {
    expect(groupCounts(index.field)).toEqual({
      stations: 2,
      'gps-ops': 1,
      weather: 1,
      other: 2,
    })
  })
})

describe('per-keystroke cost over 19,500 objects (#158)', () => {
  const N = 19_500
  const big: Obj[] = Array.from({ length: N }, (_, i) => ({
    id: String(10_000 + i),
    name: i % 2 === 0 ? `STARLINK-${String(1000 + i)}` : `OBJECT ${String(i)} DEB`,
    group: i % 2 === 0 ? 'starlink' : 'other',
    orbit: ORBIT_LEO,
    cospar: `20${String(10 + (i % 17))}-${String((i % 999) + 1).padStart(3, '0')}A`,
  }))
  const bigIndex = buildBrowseIndex(fieldOf(big))

  it('finds a name among all of them', () => {
    const r = browse(bigIndex, { list: { list: 'all' }, text: 'starlink-10' })
    expect(r.total).toBeGreaterThan(0)
    expect(r.rows.length).toBeLessThanOrEqual(DEFAULT_BROWSE_LIMIT)
  })

  it('sorts all of them by launch', () => {
    const r = browse(bigIndex, { list: { list: 'newest' }, text: '' })
    expect(r.total).toBe(N)
    const keys = r.rows.map((x) => launchOrder(big[x.index]?.cospar ?? ''))
    expect(keys).toEqual([...keys].sort((a, b) => b - a))
  })
})
