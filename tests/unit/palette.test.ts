import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  altitudeColor,
  aqiColor,
  AURORA_HEX,
  BODY_HEX,
  EONET_KINDS,
  eonetKind,
  fireMapColor,
  gdacsColor,
  GLOBE_GRADE,
  hexToLinear,
  ISS_HEX,
  LANES,
  LAYER_SWATCH,
  MUTED_HEX,
  nwsColor,
  primaryCategoryCounts,
  quakeMapColor,
  renderPaletteCss,
  SKY_WELL_HEX,
  sstColor,
  STATUS_HEX,
  SVG_GLOBE_HEX,
  swatchColor,
  TOKEN_OKLCH,
  withAlpha,
} from '@/lib/palette'
import { NwsFeatureSchema } from '@/schemas/nws'
import { LAYER_KEYS } from '@/store/ui'

const tokens = readFileSync(resolve(__dirname, '../../src/styles/tokens.css'), 'utf8')
const HEX = /^#[0-9a-f]{6}$/

describe('lanes', () => {
  it('has five lanes, each with a chart and an emissive hex', () => {
    expect(Object.keys(LANES)).toEqual(['orbital', 'thermal', 'space', 'geo', 'hydro'])
    for (const lane of Object.values(LANES)) {
      expect(lane.chart).toMatch(HEX)
      expect(lane.emit).toMatch(HEX)
    }
  })
})

describe('layer swatches', () => {
  it.each(LAYER_KEYS)('layer %s has a swatch that resolves to a hex colour', (key) => {
    expect(LAYER_SWATCH[key]).toBeDefined()
    expect(swatchColor(LAYER_SWATCH[key])).toMatch(HEX)
  })

  it('keeps hazard red for status, never for a lane layer', () => {
    expect(LAYER_SWATCH.disasters).toEqual({ kind: 'status' })
    expect(LAYER_SWATCH.nws).toEqual({ kind: 'status' })
  })
})

describe('status, ISS and neutral inks mirror tokens.css exactly', () => {
  it.each([
    ['--terminal', TOKEN_OKLCH.terminal],
    ['--amber', TOKEN_OKLCH.amber],
    ['--mcrn', TOKEN_OKLCH.mcrn],
    ['--signal', TOKEN_OKLCH.signal],
    ['--bone', TOKEN_OKLCH.bone],
    ['--bone-dim', TOKEN_OKLCH.boneDim],
    ['--bone-faint', TOKEN_OKLCH.boneFaint],
  ])('%s is declared as %s', (name, literal) => {
    expect(tokens).toContain(`${name}: ${literal};`)
  })

  it('derives valid hexes', () => {
    for (const hex of [...Object.values(STATUS_HEX), ISS_HEX, AURORA_HEX]) expect(hex).toMatch(HEX)
  })
})

describe('EONET kinds', () => {
  it('maps every known kind to a lane, a label and a letter', () => {
    for (const kind of [
      'wildfires',
      'severeStorms',
      'earthquakes',
      'volcanoes',
      'floods',
      'landslides',
      'seaLakeIce',
      'drought',
    ]) {
      const k = eonetKind(kind)
      expect(Object.keys(LANES)).toContain(k.lane)
      expect(k.label.length).toBeGreaterThan(0)
      expect(k.letter).toMatch(/^[A-Z]$/)
    }
  })

  it('uses one label per kind everywhere (no "Sea Ice" vs "Sea/Lake Ice")', () => {
    expect(eonetKind('seaLakeIce').label).toBe('Sea/Lake Ice')
    expect(eonetKind('severeStorms').label).toBe('Severe Storm')
  })

  it('falls back for an unknown kind instead of throwing', () => {
    expect(eonetKind('somethingNew')).toEqual({ lane: 'geo', label: 'somethingNew', letter: '?' })
  })

  it('treats the legacy "fire" id as wildfires', () => {
    expect(EONET_KINDS.fire).toEqual(EONET_KINDS.wildfires)
  })
})

describe('primaryCategoryCounts', () => {
  it('counts each event once, by the category its dot is coloured by', () => {
    const events = [
      { categories: [{ id: 'wildfires' }, { id: 'drought' }] },
      { categories: [{ id: 'wildfires' }] },
      { categories: [] },
    ]
    expect(Object.fromEntries(primaryCategoryCounts(events))).toEqual({ wildfires: 2 })
  })
})

describe('nwsColor (client-side, two-phase move off the server, #38)', () => {
  it('colours NWS severities on the status scale, not the iOS palette', () => {
    expect(nwsColor('Extreme')).toBe(STATUS_HEX.hazard)
    expect(nwsColor('Severe')).toBe(STATUS_HEX.hazard)
    expect(nwsColor('Moderate')).toBe(STATUS_HEX.watch)
    expect(nwsColor('Minor')).toBe(STATUS_HEX.watch)
    expect(nwsColor('Unknown')).toBe(STATUS_HEX.nominal)
  })

  it('the schema accepts payloads with and without the legacy color field', () => {
    const base = { geometry: null, event: 'Tornado Warning', severity: 'Extreme', headline: 'h' }
    expect(NwsFeatureSchema.safeParse(base).success).toBe(true)
    expect(NwsFeatureSchema.safeParse({ ...base, color: '#d000ff' }).success).toBe(true)
  })
})

describe('map ramps (#41)', () => {
  it('quakes take the geophysical lane; magnitude is size, not colour', () => {
    expect(quakeMapColor(6.5)).toBe(LANES.geo.emit)
    expect(quakeMapColor(3)).toBe(LANES.geo.emit)
    expect(quakeMapColor(null)).toBe(MUTED_HEX)
  })

  it('GDACS alerts use the status scale', () => {
    expect(gdacsColor('Red')).toBe(STATUS_HEX.hazard)
    expect(gdacsColor('Orange')).toBe(STATUS_HEX.watch)
  })

  it('fires take the thermal lane; radiative power is drawn as size, so colour takes no input', () => {
    expect(fireMapColor()).toBe(LANES.thermal.emit)
  })

  it('AQI keeps the six EPA bands, in order, on the site palette', () => {
    const bands = [5, 20, 45, 100, 200, 300].map(aqiColor)
    expect(new Set(bands).size).toBe(6)
    expect(bands[0]).toBe(STATUS_HEX.nominal)
    expect(bands[4]).toBe(STATUS_HEX.hazard)
    for (const b of bands) expect(b).toMatch(HEX)
  })

  it('aircraft altitude is a neutral lightness ramp (aircraft are not spacecraft)', () => {
    const [low, mid, high] = [1000, 6000, 11000].map(altitudeColor)
    expect(new Set([low, mid, high]).size).toBe(3)
    expect(altitudeColor(null)).toBe(MUTED_HEX)
  })

  it('sea temperature diverges from the hydro lane (cold) to the thermal lane (warm)', () => {
    expect(sstColor(2)).toBe(LANES.hydro.emit)
    expect(sstColor(29)).toBe(LANES.thermal.emit)
    expect(sstColor(18)).not.toBe(LANES.hydro.emit)
    expect(sstColor(null)).toBe(MUTED_HEX)
  })
})

describe('GLOBE_GRADE (#45: shader uniforms, never getComputedStyle oklch)', () => {
  it.each([
    ['--void', TOKEN_OKLCH.void],
    ['--copper-2', TOKEN_OKLCH.copper2],
    ['--copper-glow', TOKEN_OKLCH.copperGlow],
    ['--brass', TOKEN_OKLCH.brass],
    ['--globe-grade-deep', TOKEN_OKLCH.globeDeep],
  ])('%s is declared as %s in tokens.css', (name, literal) => {
    expect(tokens).toContain(`${name}: ${literal};`)
  })

  it('mirrors the grade mix', () => {
    expect(tokens).toContain(`--globe-grade-mix: ${String(GLOBE_GRADE.mix)};`)
  })

  it('carries every stop as linear RGB in [0, 1]', () => {
    for (const stop of [
      GLOBE_GRADE.shadow,
      GLOBE_GRADE.deep,
      GLOBE_GRADE.mid,
      GLOBE_GRADE.high,
      GLOBE_GRADE.night,
    ]) {
      expect(stop).toHaveLength(3)
      for (const c of stop) {
        expect(c).toBeGreaterThanOrEqual(0)
        expect(c).toBeLessThanOrEqual(1)
      }
    }
    // the ramp climbs: shadow < deep < mid < high in luminance
    const lum = ([r, g, b]: readonly number[]) =>
      0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0)
    expect(lum(GLOBE_GRADE.shadow)).toBeLessThan(lum(GLOBE_GRADE.deep))
    expect(lum(GLOBE_GRADE.deep)).toBeLessThan(lum(GLOBE_GRADE.mid))
    expect(lum(GLOBE_GRADE.mid)).toBeLessThan(lum(GLOBE_GRADE.high))
  })
})

describe('BODY_HEX (sky bodies shared by panels and the sky stage)', () => {
  it('covers the Sun, Moon and the seven planets as hex', () => {
    for (const name of [
      'Sun',
      'Moon',
      'Mercury',
      'Venus',
      'Mars',
      'Jupiter',
      'Saturn',
      'Uranus',
      'Neptune',
    ]) {
      expect(BODY_HEX[name]).toMatch(HEX)
    }
  })

  it('Mars is not hazard red (rule 3)', () => {
    expect(BODY_HEX['Mars']).not.toBe(STATUS_HEX.hazard)
  })
})

describe('withAlpha', () => {
  it('appends a two-digit alpha and clamps', () => {
    expect(withAlpha('#08a8ab', 0.5)).toBe('#08a8ab80')
    expect(withAlpha('#08a8ab', 1)).toBe('#08a8abff')
    expect(withAlpha('#08a8ab', 0)).toBe('#08a8ab00')
    expect(withAlpha('#08a8ab', 2)).toBe('#08a8abff')
  })
})

describe('SVG_GLOBE_HEX and SKY_WELL_HEX (SVG housing colours)', () => {
  it('are all hex', () => {
    for (const v of [...Object.values(SVG_GLOBE_HEX), ...Object.values(SKY_WELL_HEX)]) {
      expect(v).toMatch(HEX)
    }
  })
})

describe('hexToLinear', () => {
  it('decodes sRGB to linear light for shader uniforms', () => {
    expect(hexToLinear('#ffffff')).toEqual([1, 1, 1])
    expect(hexToLinear('#000000')).toEqual([0, 0, 0])
    const [r] = hexToLinear('#808080')
    expect(r).toBeCloseTo(0.2159, 3)
  })
})

describe('generated palette.css', () => {
  it('matches renderPaletteCss() (run vitest -u to regenerate)', async () => {
    await expect(renderPaletteCss()).toMatchFileSnapshot('../../src/styles/palette.css')
  })
})
