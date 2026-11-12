import { describe, expect, it } from 'vitest'

import type { SatGroupId } from '@/lib/orbit/satCatalog'
import { modelForKey } from '@/lib/orrery/modelDescriptor'
import { satFamily } from '@/lib/orrery/satFamily'

describe('satFamily (#194, tier C)', () => {
  it.each([
    ['FLOCK 4A-1', 'other'],
    ['FLOCK 4BE-17', 'other'],
    ['LEMUR-1', 'other'],
    ['LEMUR-2-WILSON', 'other'],
  ] as const)('puts %s in the CubeSat family', (name, group) => {
    expect(satFamily(name, group)).toBe('cubesat')
  })

  it('does not take a name that only contains one of the words', () => {
    expect(satFamily('NOT-A-FLOCK 1', 'other')).toBe('generic-bus')
    expect(satFamily('FLOCKING 1', 'other')).toBe('generic-bus')
    expect(satFamily('LEMURIA', 'other')).toBe('generic-bus')
  })

  it.each(['gps-ops', 'weather', 'science', 'other'] as const)(
    'gives an active %s satellite the generic bus',
    (group) => {
      expect(satFamily('SOMETHING-1', group)).toBe('generic-bus')
    },
  )

  it.each([
    'stations',
    'starlink',
    'cosmos-2251-debris',
    'iridium-33-debris',
    'fengyun-1c-debris',
  ] as const)('gives nothing in %s a stand-in', (group) => {
    expect(satFamily('SOMETHING-1', group)).toBeNull()
  })

  it('keeps a debris object out of the CubeSat family even if its name matches', () => {
    expect(satFamily('FLOCK 4A-1', 'cosmos-2251-debris')).toBeNull()
  })

  it('knows nothing of a satellite whose group is not known yet', () => {
    expect(satFamily('FLOCK 4A-1', undefined)).toBeNull()
  })
})

function loaded(noradId: string, name: string, group: SatGroupId) {
  return () => ({ noradId, name, group })
}

describe('modelForKey with the family stand-ins (#194, tier C)', () => {
  it('shows a Planet Flock satellite the CubeSat stand-in, labelled as a family model', () => {
    const model = modelForKey('sat:60001', loaded('60001', 'FLOCK 4BE-1', 'other'))
    expect(model?.kind).toBe('file')
    expect(model?.scope).toBe('family')
    expect(model?.file).toBe('/models/craft/cubesat.glb')
    expect(model?.credit).toContain('NASA')
  })

  it('shows a Spire Lemur satellite the CubeSat stand-in', () => {
    const model = modelForKey('sat:60002', loaded('60002', 'LEMUR-2-WILSON', 'other'))
    expect(model?.file).toBe('/models/craft/cubesat.glb')
  })

  it('shows another active satellite the generic bus, labelled as a family model', () => {
    const model = modelForKey('sat:60003', loaded('60003', 'OTHER-1', 'other'))
    expect(model?.scope).toBe('family')
    expect(model?.file).toBe('/models/craft/generic-bus.glb')
    expect(model?.credit).toContain('NASA')
  })

  it('shows GPS the generic bus, until a model of its own lands', () => {
    expect(modelForKey('sat:60004', loaded('60004', 'GPS-1', 'gps-ops'))?.file).toBe(
      '/models/craft/generic-bus.glb',
    )
  })

  it('leaves a satellite with a model of its own on that model', () => {
    const model = modelForKey('sat:20580', loaded('20580', 'HST', 'science'))
    expect(model?.file).toBe('/models/craft/hubble.glb')
    expect(model?.scope).toBe('own')
  })

  it('gives debris, Starlink and the stations no model', () => {
    expect(
      modelForKey('sat:1', loaded('1', 'COSMOS 2251 DEB', 'cosmos-2251-debris')),
    ).toBeUndefined()
    expect(modelForKey('sat:2', loaded('2', 'STARLINK-1', 'starlink'))).toBeUndefined()
    expect(modelForKey('sat:3', loaded('3', 'CSS (TIANHE)', 'stations'))).toBeUndefined()
  })

  it('says nothing for a satellite the renderer has not loaded', () => {
    expect(modelForKey('sat:60005', () => null)).toBeUndefined()
  })
})
