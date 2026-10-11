import { describe, expect, it } from 'vitest'

import { warmBasemapPaint } from '@/lib/basemap'
import { contrastRatio } from '@/lib/color'

const HEX = /^#[0-9a-f]{6}$/

describe('warmBasemapPaint (#41: CARTO is a vector style, so retheme it, do not filter it)', () => {
  it('paints the background void', () => {
    expect(warmBasemapPaint({ id: 'background', type: 'background' })).toEqual([
      { property: 'background-color', value: expect.stringMatching(HEX) },
    ])
  })

  it('makes water darker than land, like the globe grade', () => {
    const water = warmBasemapPaint({ id: 'water', type: 'fill' })[0]?.value ?? ''
    const land = warmBasemapPaint({ id: 'landcover', type: 'fill' })[0]?.value ?? ''
    expect(water).toMatch(HEX)
    expect(land).toMatch(HEX)
    expect(contrastRatio(land, '#000000')).toBeGreaterThan(contrastRatio(water, '#000000'))
  })

  it('draws boundaries in copper and roads as faint seams', () => {
    const boundary = warmBasemapPaint({ id: 'boundary_country_outline', type: 'line' })
    const road = warmBasemapPaint({ id: 'road_major_case', type: 'line' })
    expect(boundary[0]?.property).toBe('line-color')
    expect(road[0]?.property).toBe('line-color')
    expect(boundary[0]?.value).not.toBe(road[0]?.value)
  })

  it('leaves layers it does not own alone (data layers, rasters, symbols)', () => {
    expect(warmBasemapPaint({ id: 'gibs-layer', type: 'raster' })).toEqual([])
    expect(warmBasemapPaint({ id: 'place_label', type: 'symbol' })).toEqual([])
  })

  it('every painted value is a hex MapLibre can parse (it rejects oklch)', () => {
    for (const layer of [
      { id: 'background', type: 'background' },
      { id: 'water', type: 'fill' },
      { id: 'park', type: 'fill' },
      { id: 'building', type: 'fill' },
      { id: 'waterway', type: 'line' },
      { id: 'tunnel_path', type: 'line' },
    ]) {
      for (const p of warmBasemapPaint(layer)) expect(p.value).toMatch(HEX)
    }
  })
})
