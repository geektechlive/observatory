import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  GIBS_CREDIT,
  gibsCreditSource,
  imergDate,
  modisSource,
  NIGHT_LIGHTS,
  nightLightsSource,
  PRECIPITATION,
  precipitationSource,
} from '@/lib/gibs'

// GIBS's requested acknowledgment, verbatim from nasa-gibs.github.io/gibs-api-docs/ (read
// 2026-11-12). Credits that a source's terms ask for are licence terms (#179).
const ACK =
  "We acknowledge the use of imagery provided by services from NASA's Global Imagery Browse Services (GIBS), part of NASA's Earth Science Data and Information System (ESDIS)."

const text = (html: string) => html.replace(/<[^>]+>/g, '')

describe('GIBS acknowledgment (#211)', () => {
  it('is the exact wording GIBS asks for', () => {
    expect(text(GIBS_CREDIT)).toBe(ACK)
  })

  it('links only to https', () => {
    for (const href of GIBS_CREDIT.matchAll(/href="([^"]+)"/g)) {
      expect(href[1]).toMatch(/^https:\/\//)
    }
  })

  // MapLibre lists each distinct source credit, so a long acknowledgment on every GIBS source
  // would repeat. It lives on one empty source instead, shown while any GIBS layer is on.
  it('is carried once, by an empty credit-only source', () => {
    const source = gibsCreditSource()
    expect(source.attribution).toBe(GIBS_CREDIT)
    expect(source.data).toEqual({ type: 'FeatureCollection', features: [] })
  })

  it('is not repeated in any tile source credit', () => {
    for (const source of [nightLightsSource(), precipitationSource(), modisSource('2026-11-11')]) {
      expect(source.attribution ?? '').not.toContain('Global Imagery Browse Services')
    }
  })
})

describe('MODIS true colour layer', () => {
  it('names the product it shows', () => {
    expect(modisSource('2026-11-11').attribution).toContain('MODIS')
  })
})

// Values from GIBS's WMTS capabilities for EPSG:3857, read 2026-11-12:
// https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/WMTSCapabilities.xml
describe('night lights layer: VIIRS Black Marble (#211)', () => {
  const source = nightLightsSource()

  it('asks GIBS for the newest annual composite, 2016, at the matrix set it is published in', () => {
    expect(NIGHT_LIGHTS.identifier).toBe('VIIRS_Black_Marble')
    expect(source.tiles).toEqual([
      'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/2016-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png',
    ])
  })

  it('stops requesting tiles past Level8 so deeper zooms overzoom instead of 404ing', () => {
    expect(source.maxzoom).toBe(8)
    expect(source.tileSize).toBe(256)
  })

  it('names the product and its year', () => {
    expect(source.attribution).toContain('Black Marble 2016')
  })
})

describe('precipitation layer: IMERG daily rate (#211)', () => {
  const now = new Date('2026-11-12T15:00:00Z')
  const source = precipitationSource(now)

  it('asks GIBS for IMERG_Precipitation_Rate at Level6 as PNG', () => {
    expect(PRECIPITATION.identifier).toBe('IMERG_Precipitation_Rate')
    expect(source.tiles).toEqual([
      'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/IMERG_Precipitation_Rate/default/2026-11-10/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png',
    ])
    expect(source.maxzoom).toBe(6)
  })

  it('states the day it shows in the credit, since it is never today', () => {
    expect(source.attribution).toContain('GPM IMERG')
    expect(source.attribution).toContain('10 Nov 2026')
  })
})

describe('imergDate: the newest day GIBS has published (#211)', () => {
  // At 05:35Z on 12 Nov the newest day was 10 Nov and 11 Nov answered 404, so the lag is two
  // days by mid-morning UTC. Before noon UTC it steps back one more day for margin.
  it('is two days back from noon UTC', () => {
    expect(imergDate(new Date('2026-11-12T12:00:00Z'))).toBe('2026-11-10')
    expect(imergDate(new Date('2026-11-12T23:59:59Z'))).toBe('2026-11-10')
  })

  it('is three days back before noon UTC', () => {
    expect(imergDate(new Date('2026-11-12T00:00:00Z'))).toBe('2026-11-09')
    expect(imergDate(new Date('2026-11-12T11:59:59Z'))).toBe('2026-11-09')
  })

  it('crosses month and year boundaries in UTC', () => {
    expect(imergDate(new Date('2027-01-01T13:00:00Z'))).toBe('2026-12-30')
    expect(imergDate(new Date('2026-03-02T01:00:00Z'))).toBe('2026-02-27')
  })
})

describe('content security policy (#211)', () => {
  it('lets the browser load GIBS tiles: dev ignores _headers, so only production would break', () => {
    const headers = readFileSync(resolve(__dirname, '../../public/_headers'), 'utf8')
    const img = /img-src ([^;]+);/.exec(headers)?.[1] ?? ''
    const connect = /connect-src ([^;]+);/.exec(headers)?.[1] ?? ''
    expect(img.split(/\s+/)).toContain('https://gibs.earthdata.nasa.gov')
    // MapLibre fetches raster tiles with fetch() from its worker, so connect-src matters too.
    expect(connect.split(/\s+/)).toContain('https://gibs.earthdata.nasa.gov')
  })
})
