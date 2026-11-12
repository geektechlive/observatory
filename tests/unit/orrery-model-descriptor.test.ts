import { describe, expect, it } from 'vitest'

import { CRAFT_MODELS, craftModelFor } from '@/lib/orrery/craftModels'
import {
  type FileDescriptor,
  type ModelDescriptor,
  modelForSatellite,
  SATELLITE_MODELS_BY_FAMILY,
  SATELLITE_MODELS_BY_NORAD,
  spacecraftDescriptor,
} from '@/lib/orrery/modelDescriptor'

const own: FileDescriptor = {
  kind: 'file',
  file: '/models/craft/iss.glb',
  credit: 'Own credit',
  licence: 'CC0',
  sourceUrl: 'https://example.test/iss',
  attitude: 'earth',
  axis: [0, 1, 0],
  attitudeNote: 'Nadir',
  scope: 'own',
}
const family: ModelDescriptor = { ...own, file: '/models/craft/starlink.glb', scope: 'family' }

describe('spacecraftDescriptor (#202)', () => {
  it('describes every spacecraft model the table holds, as its own model', () => {
    for (const naif of Object.keys(CRAFT_MODELS)) {
      const d = spacecraftDescriptor(naif)
      const m = craftModelFor(naif)
      expect(d, naif).toBeDefined()
      expect(d?.scope).toBe('own')
      expect(d?.attitude).toBe(m?.attitude)
      expect(d?.axis).toEqual(m?.axis)
      expect(d?.credit).toBe(m?.credit)
      expect(d?.licence.length).toBeGreaterThan(0)
    }
  })

  it("keeps the file, source and stand-in of today's table", () => {
    expect(spacecraftDescriptor('-31')).toMatchObject({
      kind: 'file',
      file: '/models/craft/voyager.glb',
      sourceUrl: 'https://science.nasa.gov/3d-resources/voyager-probe-a/',
    })
    expect(spacecraftDescriptor('-255')).toMatchObject({
      kind: 'standin',
      file: null,
      standIn: 'psyche',
      sourceUrl: null,
    })
  })

  it('has none for an unknown NAIF id', () => {
    expect(spacecraftDescriptor('-999999')).toBeUndefined()
  })
})

describe('modelForSatellite (#202)', () => {
  it('holds the trial batch (#194) by NORAD id as their own, and only the tier C stand-ins by family', () => {
    for (const id of ['20580', '25544', '25575', '25994', '26400', '26700', '36086', '49044']) {
      expect(SATELLITE_MODELS_BY_NORAD[id]?.scope).toBe('own')
    }
    expect(Object.keys(SATELLITE_MODELS_BY_FAMILY).sort()).toEqual(['cubesat', 'generic-bus'])
    for (const model of Object.values(SATELLITE_MODELS_BY_FAMILY)) {
      expect(model.scope).toBe('family')
    }
    expect(modelForSatellite(25544, 'iss')?.file).toBe('/models/craft/iss.glb')
    expect(modelForSatellite(1, 'iss')).toBeUndefined()
  })

  it("prefers the object's own model, then its family, then nothing", () => {
    const tables = { byNorad: { '25544': own }, byFamily: { starlink: family } }
    expect(modelForSatellite(25544, 'starlink', tables)).toBe(own)
    expect(modelForSatellite(44713, 'starlink', tables)).toBe(family)
    expect(modelForSatellite(44713, 'oneweb', tables)).toBeUndefined()
    expect(modelForSatellite(44713, null, tables)).toBeUndefined()
  })
})
