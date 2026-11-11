import { describe, expect, it } from 'vitest'

import { modelForKey } from '@/lib/orrery/modelDescriptor'

const loaded = (noradId: string) => (key: string) => (key === `sat:${noradId}` ? { noradId } : null)

/**
 * The CelesTrak records of the ISS: the station's own id and the module records that share
 * its element set (stations and active groups, 2026-11-10). See docs/reference/satellite-models.md.
 */
const ISS_IDS = ['25544', '25575', '26400', '26700', '36086', '49044']

describe('tier-A satellite models (#194)', () => {
  it.each(ISS_IDS)('sat:%s resolves to the ISS model', (id) => {
    const model = modelForKey(`sat:${id}`, loaded(id))
    expect(model?.kind).toBe('file')
    expect(model?.file).toBe('/models/craft/iss.glb')
    expect(model?.scope).toBe('own')
    expect(model?.credit).toContain('NASA')
  })

  it('resolves Hubble (20580) to its own model', () => {
    const model = modelForKey('sat:20580', loaded('20580'))
    expect(model?.file).toBe('/models/craft/hubble.glb')
    expect(model?.scope).toBe('own')
    expect(model?.credit).toContain('NASA')
  })

  it('resolves Terra (25994) to its own model', () => {
    const model = modelForKey('sat:25994', loaded('25994'))
    expect(model?.file).toBe('/models/craft/terra.glb')
    expect(model?.scope).toBe('own')
    expect(model?.credit).toContain('NASA')
  })

  it('gives a satellite with no entry no model', () => {
    expect(modelForKey('sat:1', loaded('1'))).toBeUndefined()
  })
})
