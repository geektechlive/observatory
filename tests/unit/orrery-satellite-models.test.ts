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

  // Second batch. CelesTrak active ids, 2026-11-10. `family`: a model of the same design or
  // generation, not of that very satellite (DetailView then says it is a stand-in).
  it.each([
    ['19548', 'tdrs-gen1', 'family', 'NASA/JPL/Eyes on the Solar System'], // TDRS 3
    ['21639', 'tdrs-gen1', 'family', 'NASA/JPL/Eyes on the Solar System'], // TDRS 5
    ['22314', 'tdrs-gen1', 'family', 'NASA/JPL/Eyes on the Solar System'], // TDRS 6
    ['23613', 'tdrs-gen1', 'family', 'NASA/JPL/Eyes on the Solar System'], // TDRS 7
    ['26388', 'tdrs-gen2', 'family', 'NASA/Christopher R. Meaney'], // TDRS 8
    ['39070', 'tdrs-gen2', 'family', 'NASA/Christopher R. Meaney'], // TDRS 11
    ['39504', 'tdrs-gen2', 'family', 'NASA/Christopher R. Meaney'], // TDRS 12
    ['42915', 'tdrs-gen2', 'family', 'NASA/Christopher R. Meaney'], // TDRS 13
    ['35491', 'goes', 'family', 'NASA/Christopher R. Meaney'], // GOES 14
    ['36411', 'goes', 'family', 'NASA/Christopher R. Meaney'], // GOES 15
    ['41866', 'goes', 'family', 'NASA/Christopher R. Meaney'], // GOES 16
    ['43226', 'goes', 'family', 'NASA/Christopher R. Meaney'], // GOES 17
    ['51850', 'goes', 'family', 'NASA/Christopher R. Meaney'], // GOES 18
    ['60133', 'goes', 'family', 'NASA/Christopher R. Meaney'], // GOES 19
    ['39084', 'landsat8', 'own', 'NASA/Christopher R. Meaney'], // LANDSAT 8
    ['49260', 'landsat8', 'family', 'NASA/Christopher R. Meaney'], // LANDSAT 9
    ['27424', 'aqua', 'own', 'NASA/Brian E. Kumanchik; NASA/Christian A. Lopez'], // AQUA
    ['28376', 'aura', 'own', 'NASA/Ames Research Center'], // AURA
    ['37849', 'suomi-npp', 'own', 'NASA/Brian E. Kumanchik; NASA/Christian A. Lopez'], // SUOMI NPP
    ['43013', 'suomi-npp', 'family', 'NASA/Brian E. Kumanchik; NASA/Christian A. Lopez'], // NOAA 20
    ['54234', 'suomi-npp', 'family', 'NASA/Brian E. Kumanchik; NASA/Christian A. Lopez'], // NOAA 21
  ])('sat:%s resolves to %s (%s), credit %s', (id, name, scope, credit) => {
    const model = modelForKey(`sat:${id}`, loaded(id))
    expect(model?.file).toBe(`/models/craft/${name}.glb`)
    expect(model?.scope).toBe(scope)
    expect(model?.credit).toBe(credit)
    expect(model?.sourceUrl).toMatch(/^https:\/\/science\.nasa\.gov\/3d-resources\/.+\/$/)
  })

  it('gives a satellite with no entry no model', () => {
    expect(modelForKey('sat:1', loaded('1'))).toBeUndefined()
  })
})
