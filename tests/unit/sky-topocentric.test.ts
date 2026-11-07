/**
 * Where an object stands in the user's sky (#99, spec Parts 4 and 17): WGS84, ENU and
 * the cardinal azimuths, then a comet checked against Horizons' own observer table.
 */
import { describe, expect, it } from 'vitest'

import { compassPoint } from '@/lib/compass'
import {
  altAzFromEcef,
  eclipticToEquatorial,
  equatorialJ2000,
  precessToDate,
  topocentric,
  wgs84ToEcef,
} from '@/lib/sky/topocentric'

import fixture from './fixtures/tonight/c2024t5-kittpeak.json'

const DEG = 180 / Math.PI
const raDec = (v: { x: number; y: number; z: number }) => ({
  ra: (((Math.atan2(v.y, v.x) * DEG) % 360) + 360) % 360,
  dec: Math.asin(v.z / Math.hypot(v.x, v.y, v.z)) * DEG,
})

describe('WGS84', () => {
  it('puts the equator at the prime meridian on the x axis, 6378.137 km out', () => {
    const p = wgs84ToEcef(0, 0, 0)
    expect(p.x).toBeCloseTo(6378.137, 3)
    expect(p.y).toBeCloseTo(0, 6)
    expect(p.z).toBeCloseTo(0, 6)
  })

  it('puts the north pole at the polar radius, 6356.752 km', () => {
    const p = wgs84ToEcef(90, 0, 0)
    expect(Math.hypot(p.x, p.y)).toBeLessThan(1e-9)
    expect(p.z).toBeCloseTo(6356.752, 3)
  })

  it('adds height along the local vertical', () => {
    const p = wgs84ToEcef(0, 90, 2)
    expect(p.y).toBeCloseTo(6380.137, 3)
  })
})

describe('ENU and the cardinal azimuths', () => {
  // An observer on the equator at longitude 0: east is +y, north +z, up +x.
  const observer = { lat: 0, lon: 0, heightKm: 0 }
  const base = wgs84ToEcef(0, 0, 0)
  const toward = (dx: number, dy: number, dz: number) =>
    altAzFromEcef({ x: base.x + dx, y: base.y + dy, z: base.z + dz }, observer)

  it.each([
    ['north', 0, 0, 1000, 0],
    ['east', 0, 1000, 0, 90],
    ['south', 0, 0, -1000, 180],
    ['west', 0, -1000, 0, 270],
  ])('a point due %s on the horizon has azimuth %d°', (_name, dx, dy, dz, az) => {
    const look = toward(dx, dy, dz)
    expect(look.azimuth).toBeCloseTo(az, 6)
    expect(look.altitude).toBeCloseTo(0, 6)
  })

  it('a point straight up has altitude 90°', () => {
    expect(toward(1000, 0, 0).altitude).toBeCloseTo(90, 6)
  })

  it('names the compass point', () => {
    expect([0, 90, 180, 270, 337.5, 359].map(compassPoint)).toEqual([
      'N',
      'E',
      'S',
      'W',
      'NNW',
      'N',
    ])
  })
})

describe('frames', () => {
  it('tips the ecliptic pole to declination 90° - ε', () => {
    const { dec } = raDec(eclipticToEquatorial({ x: 0, y: 0, z: 1 }))
    expect(dec).toBeCloseTo(90 - 23.4392911, 6)
  })

  it('leaves a direction alone at J2000', () => {
    const v = precessToDate({ x: 0.3, y: 0.4, z: 0.5 }, 2451545.0)
    expect(v.x).toBeCloseTo(0.3, 12)
    expect(v.y).toBeCloseTo(0.4, 12)
    expect(v.z).toBeCloseTo(0.5, 12)
  })

  it('moves the equinox 3.075 s of RA a year (about 0.344° by 2026-11-07)', () => {
    // A star at RA 0, Dec 0 gains m = 3.075 s/yr in RA; 26.85 years after J2000.
    const jd = 2461351.5
    const { ra, dec } = raDec(precessToDate({ x: 1, y: 0, z: 0 }, jd))
    expect(ra).toBeCloseTo((3.075 * 26.85 * 15) / 3600, 3)
    expect(dec).toBeCloseTo((20.04 * 26.85) / 3600, 3)
  })
})

describe('C/2024 T5 (ATLAS) from Kitt Peak, against Horizons (2026-11-07)', () => {
  const [lonText, latText, hText] = fixture.siteGeodetic.split(',')
  const site = {
    lon: Number(lonText) - 360,
    lat: Number(latText),
    heightKm: Number.parseFloat(hText ?? '0'),
  }
  const comet = { fine: fixture.comet.fine, coarse: null }
  const rows = fixture.rows.map((r) => ({
    time: new Date(`${r.utc.replace(/-(\w{3})-/, ' $1 ')} UTC`),
    ra: Number(r.cols[2]),
    dec: Number(r.cols[3]),
    az: Number(r.cols[4]),
    el: Number(r.cols[5]),
  }))

  it('reads every row of the fixture', () => {
    expect(fixture.target).toBe('ATLAS (C/2024 T5)')
    expect(rows).toHaveLength(25)
    expect(rows.every((r) => Number.isFinite(r.el) && !Number.isNaN(r.time.getTime()))).toBe(true)
  })

  it('matches the astrometric RA and Dec to 0.003° (measured 0.001°)', () => {
    for (const r of rows) {
      const v = equatorialJ2000({ ...comet, coarse: null }, r.time)
      expect(v).not.toBeNull()
      const got = raDec(v ?? { x: 1, y: 0, z: 0 })
      expect(Math.abs(got.ra - r.ra)).toBeLessThan(0.003)
      expect(Math.abs(got.dec - r.dec)).toBeLessThan(0.003)
    }
  })

  it('matches the airless altitude and azimuth to 0.02° while it is up (measured 0.008°)', () => {
    const up = rows.filter((r) => r.el > 10)
    expect(up.length).toBeGreaterThan(5)
    for (const r of up) {
      const look = topocentric({ ...comet, coarse: null }, r.time, site)
      expect(look).not.toBeNull()
      expect(Math.abs((look?.altitude ?? 0) - r.el)).toBeLessThan(0.02)
      const dAz = (((((look?.azimuth ?? 0) - r.az) % 360) + 540) % 360) - 180
      expect(Math.abs(dAz)).toBeLessThan(0.02)
    }
  })

  it('refuses a date outside the sampled span instead of extrapolating', () => {
    expect(
      topocentric({ ...comet, coarse: null }, new Date('2027-06-01T00:00:00Z'), site),
    ).toBeNull()
  })
})
