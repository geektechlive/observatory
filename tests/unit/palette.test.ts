import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  AURORA_HEX,
  EONET_KINDS,
  eonetKind,
  hexToLinear,
  ISS_HEX,
  LANES,
  LAYER_SWATCH,
  nwsColor,
  primaryCategoryCounts,
  renderPaletteCss,
  STATUS_HEX,
  swatchColor,
  TOKEN_OKLCH,
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
