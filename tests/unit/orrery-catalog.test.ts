/**
 * What the orrery can find and where off-screen craft point (#93): the search catalogue
 * with a "no data for this date" flag, and rim markers for craft beyond the view.
 */
import { describe, expect, it } from 'vitest'

import { buildCatalog, noDataNotice } from '@/components/orrery/catalog'
import { rimPoint, spreadRim } from '@/components/orrery/labelLayout'
import type { OrreryTrack } from '@/schemas/orreryBodies'

const JD = 2461350.5

function track(naifId: string, name: string, extra: Partial<OrreryTrack> = {}): OrreryTrack {
  return {
    id: `naif:${naifId}`,
    naifId,
    name,
    mission: 'm',
    category: 'spacecraft',
    group: 'deep-space',
    target: null,
    observedUntil: null,
    availableFrom: null,
    availableTo: null,
    // Two samples a day apart around JD.
    fine: { start: JD - 0.5, step: 1, samples: [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0] },
    coarse: null,
    ...extra,
  }
}

describe('buildCatalog', () => {
  const tracks = [
    track('399', 'Earth', { category: 'planet', group: 'planet' }),
    track('301', 'Moon', { category: 'moon', group: 'moon' }),
    track('-31', 'Voyager 1'),
    track('-21', 'SOHO', { category: 'space_telescope', group: 'l1', fine: null }),
  ]

  it('lists the Sun, the planets, the Moon and the craft, Earth once', () => {
    const labels = buildCatalog(tracks, JD).map((i) => i.label)
    expect(labels.slice(0, 9)).toEqual([
      'Sun',
      'Mercury',
      'Venus',
      'Earth',
      'Mars',
      'Jupiter',
      'Saturn',
      'Uranus',
      'Neptune',
    ])
    expect(labels.filter((l) => l === 'Earth')).toHaveLength(1)
    expect(labels).toContain('Moon')
    expect(labels).toContain('Voyager 1')
  })

  it('keys craft and the Moon by NAIF id, and groups them as the controls do (Part 19)', () => {
    const v1 = buildCatalog(tracks, JD).find((i) => i.label === 'Voyager 1')
    expect(v1).toMatchObject({ key: 'naif:-31', kind: 'craft', group: 'Deep space' })
    const soho = buildCatalog(tracks, JD).find((i) => i.label === 'SOHO')
    expect(soho?.group).toBe('L1 & L2 observatories')
  })

  it('marks a craft with no data at the date, rather than dropping it', () => {
    const items = buildCatalog(tracks, JD)
    expect(items.find((i) => i.label === 'Voyager 1')?.available).toBe(true)
    expect(items.find((i) => i.label === 'SOHO')?.available).toBe(false)
    expect(buildCatalog(tracks, JD + 10).find((i) => i.label === 'Voyager 1')?.available).toBe(
      false,
    )
  })

  it('lists the moons under Moons, Earth’s Moon once, flagged when no data covers the date (#107)', () => {
    const moon = (key: string, name: string, parent: 'Earth' | 'Jupiter', ok: boolean) => ({
      key,
      name,
      parent,
      periodDays: 2,
      semiMajorAxisKm: 1,
      center: 'c',
      target: null,
      spans: [],
      relative: () =>
        ok
          ? {
              position: { x: 1, y: 0, z: 0 },
              velocity: { x: 0, y: 0, z: 0 },
              resolution: 'fine' as const,
            }
          : null,
    })
    const items = buildCatalog(tracks, JD, [
      moon('naif:301', 'Moon', 'Earth', true),
      moon('naif:501', 'Io', 'Jupiter', false),
    ])
    expect(items.filter((i) => i.label === 'Moon')).toHaveLength(1)
    expect(items.find((i) => i.label === 'Moon')).toMatchObject({
      key: 'naif:301',
      kind: 'moon',
      group: 'Moons',
      available: true,
    })
    expect(items.find((i) => i.label === 'Io')).toMatchObject({
      key: 'naif:501',
      group: 'Moons',
      available: false,
    })
  })

  it('says how many craft and moons are hidden for want of data, or nothing (#114)', () => {
    const item = (label: string, kind: 'craft' | 'moon' | 'planet', available: boolean) => ({
      key: label,
      label,
      kind,
      group: 'g',
      available,
    })
    expect(noDataNotice([item('Mars', 'planet', true), item('Voyager 1', 'craft', true)])).toBe(
      null,
    )
    expect(noDataNotice([item('Voyager 1', 'craft', false)])).toBe(
      'Voyager 1 has no data for this date and is hidden. Positions are never extrapolated.',
    )
    expect(
      noDataNotice([
        item('Voyager 1', 'craft', false),
        item('Io', 'moon', false),
        item('Titan', 'moon', false),
      ]),
    ).toBe(
      '1 spacecraft and 2 moons have no data for this date and are hidden. Positions are never extrapolated.',
    )
  })

  // #92: this fortnight's close approaches, and Scout's objects with no position.
  it('lists close approaches and Scout objects, and L1, each marked honestly', () => {
    const span = { start: JD - 1, step: 1, samples: new Array(3 * 6).fill(0.5) }
    const approach = {
      id: 'sb:2026 VY2',
      name: '(2026 VY2)',
      fine: span,
    }
    const items = buildCatalog(tracks, JD, [], {
      approaches: [approach, { ...approach, id: 'sb:old', name: '(2026 OLD)', fine: null }],
      scout: ['6L54C21'],
    })
    const vy2 = items.find((i) => i.key === 'sb:2026 VY2')
    expect(vy2).toMatchObject({ label: '2026 VY2', kind: 'asteroid', available: true })
    expect(vy2?.group).toMatch(/close approaches/i)
    expect(items.find((i) => i.key === 'sb:old')?.available).toBe(false)
    const scout = items.find((i) => i.key === 'scout:6L54C21')
    expect(scout).toMatchObject({ kind: 'scout', available: false })
    expect(scout?.note).toMatch(/no position/i)
    expect(items.find((i) => i.key === 'L1')).toMatchObject({ kind: 'marker', available: true })
    // Scout's objects never had a position: they are not "hidden for want of data".
    expect(noDataNotice(items)).toBe(
      'SOHO has no data for this date and is hidden. Positions are never extrapolated.',
    )
  })

  // #149: 2026 VO5 was in CAD before Horizons knew it, so it has no samples at all.
  // That isn't "no data for this date": the stage said so on every view.
  it('says a never-placed approach has no position yet, and keeps it off the stage notice', () => {
    const span = { start: JD - 1, step: 1, samples: new Array(3 * 6).fill(0.5) }
    const placed = { id: 'sb:2026 VY2', name: '(2026 VY2)', fine: span }
    const never = { id: 'sb:2026 VO5', name: '(2026 VO5)', fine: null }
    const items = buildCatalog([], JD, [], { approaches: [placed, never], scout: [] })
    const vo5 = items.find((i) => i.key === 'sb:2026 VO5')
    expect(vo5).toMatchObject({ kind: 'asteroid', available: false })
    expect(vo5?.note).toMatch(/no position from JPL Horizons yet/i)
    expect(noDataNotice(items)).toBeNull()
    // An approach whose samples miss the date is still hidden for want of data.
    const later = buildCatalog([], JD + 30, [], { approaches: [placed, never], scout: [] })
    expect(noDataNotice(later)).toBe(
      '2026 VY2 has no data for this date and is hidden. Positions are never extrapolated.',
    )
  })

  it('always has the planets, even with no payload', () => {
    expect(buildCatalog([], JD).every((i) => i.available)).toBe(true)
  })
})

describe('rimPoint', () => {
  const W = 800
  const H = 600

  it('pins a point off the right edge to the right rim, at the same height line', () => {
    const p = rimPoint(1600, 300, false, W, H, 10)
    expect(p.x).toBe(W - 10)
    expect(p.y).toBeCloseTo(300, 6)
  })

  it('pins a point far above to the top rim along the line from the centre', () => {
    const p = rimPoint(400, -2000, false, W, H, 10)
    expect(p.y).toBe(10)
    expect(p.x).toBeCloseTo(400, 6)
  })

  it('mirrors a point behind the camera', () => {
    const p = rimPoint(1600, 300, true, W, H, 10)
    expect(p.x).toBe(10)
  })

  it('keeps clear of the time bar at the bottom', () => {
    const p = rimPoint(400, 5000, false, W, H, 10, 110)
    expect(p.y).toBe(H - 110)
  })
})

describe('spreadRim', () => {
  it('moves overlapping markers on the bottom rim apart along it', () => {
    const out = spreadRim([
      { key: 'a', text: 'Voyager 1 · 172 au', x: 400, y: 590, alongX: true },
      { key: 'b', text: 'New Horizons · 66 au', x: 420, y: 590, alongX: true },
    ])
    const a = out.get('a')
    const b = out.get('b')
    expect(a?.y).toBe(590)
    expect(b?.y).toBe(590)
    expect(Math.abs((b?.x ?? 0) - (a?.x ?? 0))).toBeGreaterThan(100)
  })

  it('moves overlapping markers on a side rim apart vertically', () => {
    const out = spreadRim([
      { key: 'a', text: 'Voyager 1', x: 10, y: 300, alongX: false },
      { key: 'b', text: 'Voyager 2', x: 10, y: 305, alongX: false },
    ])
    expect(Math.abs((out.get('b')?.y ?? 0) - (out.get('a')?.y ?? 0))).toBeGreaterThanOrEqual(18)
  })

  it('keeps a top or bottom marker whole inside the stage', () => {
    const out = spreadRim(
      [{ key: 'a', text: 'New Horizons · 66 au', x: 795, y: 590, alongX: true }],
      { left: 10, right: 790 },
    )
    const w = 'New Horizons · 66 au'.length * 7 + 28
    expect((out.get('a')?.x ?? 0) + w / 2).toBeLessThanOrEqual(790)
  })

  it('slides the other way when the rim runs out', () => {
    const out = spreadRim(
      [
        { key: 'a', text: 'Voyager 1 · 172 au', x: 700, y: 590, alongX: true },
        { key: 'b', text: 'Voyager 2 · 144 au', x: 700, y: 590, alongX: true },
      ],
      { left: 10, right: 790 },
    )
    expect(out.get('b')?.x ?? 0).toBeLessThan(out.get('a')?.x ?? 0)
  })

  it('leaves markers that do not touch where they are', () => {
    const out = spreadRim([
      { key: 'a', text: 'A', x: 10, y: 100, alongX: false },
      { key: 'b', text: 'B', x: 10, y: 400, alongX: false },
    ])
    expect(out.get('b')?.y).toBe(400)
  })
})

describe('satellites in search (#98)', () => {
  it('lists the space stations under their own heading, with the ISS first', () => {
    const items = buildCatalog([], JD, [], undefined, [
      { key: 'sat:48274', name: 'CSS (TIANHE)' },
      { key: 'sat:25544', name: 'ISS (ZARYA)' },
    ])
    const sats = items.filter((i) => i.kind === 'satellite')
    expect(sats.map((i) => i.label)).toEqual(['ISS (ZARYA)', 'CSS (TIANHE)'])
    expect(sats.every((i) => i.group === 'Space stations' && i.available)).toBe(true)
  })

  it('keeps the ISS findable before its group has loaded', () => {
    const items = buildCatalog([], JD, [], undefined, [])
    expect(items.find((i) => i.key === 'sat:25544')).toMatchObject({
      label: 'ISS',
      kind: 'satellite',
    })
  })

  it('never counts satellites in the stage’s "no data" notice', () => {
    const items = buildCatalog([], JD, [], undefined, [])
    expect(noDataNotice(items.map((i) => ({ ...i, available: i.kind !== 'satellite' })))).toBeNull()
  })
})
