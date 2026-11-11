import { describe, expect, it } from 'vitest'

import {
  type FileDescriptor,
  modelForKey,
  type SatelliteModelTable,
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
const tables = {
  byNorad: { '25544': own } satisfies SatelliteModelTable,
  byFamily: {} satisfies SatelliteModelTable,
}
const noSat = () => null

describe('modelForKey (#203)', () => {
  it('resolves a spacecraft key through its NAIF id', () => {
    expect(modelForKey('naif:-170', noSat)?.file).toBe('/models/craft/jwst.glb')
    expect(modelForKey('naif:-255', noSat)?.kind).toBe('standin')
  })

  it('has no model for a craft, moon or planet the table does not hold', () => {
    expect(modelForKey('naif:-9999', noSat)).toBeUndefined()
    expect(modelForKey('naif:301', noSat)).toBeUndefined()
    expect(modelForKey('Earth', noSat)).toBeUndefined()
    expect(modelForKey('l1', noSat)).toBeUndefined()
  })

  it('resolves a satellite key through the NORAD id its layer reports', () => {
    const sat = (key: string) => (key === 'sat:25544' ? { noradId: '25544' } : null)
    expect(modelForKey('sat:25544', sat, tables)).toBe(own)
  })

  it('has no model for a satellite that is not loaded or has no table entry', () => {
    expect(modelForKey('sat:25544', noSat, tables)).toBeUndefined()
    expect(modelForKey('sat:1', () => ({ noradId: '1' }), tables)).toBeUndefined()
  })

  it('has no model in the shipped tables for a satellite they do not list', () => {
    expect(modelForKey('sat:1', () => ({ noradId: '1' }))).toBeUndefined()
  })
})
