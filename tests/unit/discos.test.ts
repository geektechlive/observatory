import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  CRAFT_COSPAR,
  discosObjectsUrl,
  discosStale,
  nameMatches,
  parseDiscosObjects,
} from '@/lib/discos'

// Synthetic JSON:API answers in DISCOSweb's shape (data[], included[], attributes,
// relationships), then real ones recorded in the live dry run (fixtures/discos).

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(join(__dirname, 'fixtures', 'discos', name), 'utf8'))

describe('real DISCOSweb answers (recorded 2026-11-07 22:23 UTC)', () => {
  it('every orrery craft comes back under its COSPAR id with the name expected', () => {
    const objects = parseDiscosObjects(fixture('craft.json'))
    for (const [naif, c] of Object.entries(CRAFT_COSPAR)) {
      const o = objects.find((x) => x.cosparId === c.cospar)
      expect(o, naif).toBeDefined()
      expect(nameMatches(o?.name ?? '', c.expect), `${naif} ${o?.name ?? ''}`).toBe(true)
    }
    const v1 = objects.find((o) => o.cosparId === '1977-084A')
    expect(v1?.massKg).toBe(817.64)
    expect(v1?.operators).toEqual(['Jet Propulsion Lab'])
  })

  it('the ISS and Hubble by NORAD number', () => {
    const objects = parseDiscosObjects(fixture('satellites.json'))
    expect(objects.find((o) => o.satno === '25544')).toMatchObject({
      name: 'International Space Station',
      massKg: 450000,
      spanM: 108.5,
    })
    expect(objects.find((o) => o.satno === '20580')?.name).toBe('Hubble Space Telescope')
  })
})

describe('the orrery craft by COSPAR id', () => {
  it('covers the craft drawn in the orrery, each with a name to check the answer by', () => {
    expect(CRAFT_COSPAR['-31']?.cospar).toBe('1977-084A')
    expect(CRAFT_COSPAR['-170']?.cospar).toBe('2021-130A')
    for (const c of Object.values(CRAFT_COSPAR)) {
      expect(c.cospar).toMatch(/^\d{4}-\d{3}[A-Z]+$/)
      expect(c.expect.length).toBeGreaterThan(0)
    }
  })

  it('checks a returned name against the expected one, loosely', () => {
    expect(nameMatches('Voyager 1', ['voyager 1'])).toBe(true)
    expect(nameMatches('JWST', ['jwst', 'webb'])).toBe(true)
    expect(nameMatches('James Webb Space Telescope', ['jwst', 'webb'])).toBe(true)
    expect(nameMatches('Voyager 2', ['voyager 1'])).toBe(false)
  })
})

describe('discosObjectsUrl', () => {
  it('asks for up to 100 objects by NORAD number with their operators', () => {
    const url = new URL(discosObjectsUrl({ satnos: ['25544', '20580'] }))
    expect(url.origin + url.pathname).toBe('https://discosweb.esoc.esa.int/api/objects')
    expect(url.searchParams.get('filter')).toBe('in(satno,(25544,20580))')
    expect(url.searchParams.get('include')).toBe('operators')
    expect(url.searchParams.get('page[size]')).toBe('100')
  })

  it('asks by COSPAR id, quoted', () => {
    const url = new URL(discosObjectsUrl({ cospars: ['1977-084A', '2021-130A'] }))
    expect(url.searchParams.get('filter')).toBe("in(cosparId,('1977-084A','2021-130A'))")
  })

  it('refuses more than a page at once', () => {
    expect(() =>
      discosObjectsUrl({ satnos: Array.from({ length: 101 }, (_, i) => String(i)) }),
    ).toThrow()
  })
})

describe('parseDiscosObjects', () => {
  const answer = {
    data: [
      {
        type: 'object',
        id: '1',
        attributes: {
          satno: 25544,
          cosparId: '1998-067A',
          name: 'International Space Station',
          objectClass: 'Payload',
          mass: 450000,
          shape: 'Box + 2 Pan',
          width: 108.5,
          height: 20,
          depth: 73,
          diameter: null,
          span: 108.5,
          firstEpoch: '1998-11-20',
        },
        relationships: { operators: { data: [{ type: 'organisation', id: '7' }] } },
      },
      {
        type: 'object',
        id: '2',
        attributes: { satno: null, cosparId: '1977-084A', name: 'Voyager 1', mass: 721.9 },
        relationships: { operators: { data: [] } },
      },
    ],
    included: [{ type: 'organisation', id: '7', attributes: { name: 'NASA' } }],
  }

  it('reads mass, size, shape and operators', () => {
    const [iss, v1] = parseDiscosObjects(answer)
    expect(iss).toEqual({
      satno: '25544',
      cosparId: '1998-067A',
      name: 'International Space Station',
      objectClass: 'Payload',
      massKg: 450000,
      shape: 'Box + 2 Pan',
      widthM: 108.5,
      heightM: 20,
      depthM: 73,
      diameterM: null,
      spanM: 108.5,
      operators: ['NASA'],
      firstEpoch: '1998-11-20',
    })
    expect(v1?.satno).toBeNull()
    expect(v1?.operators).toEqual([])
    expect(v1?.widthM).toBeNull()
  })

  it('throws on an answer without data (contract)', () => {
    expect(() => parseDiscosObjects({ errors: [{ title: 'nope' }] })).toThrow(/DISCOS/)
  })
})

describe('discosStale', () => {
  it('refetches an object a week after it was fetched', () => {
    const now = Date.parse('2026-11-08T00:00:00Z')
    expect(discosStale(undefined, now)).toBe(true)
    expect(discosStale('2026-11-02T00:00:00Z', now)).toBe(false)
    expect(discosStale('2026-10-31T00:00:00Z', now)).toBe(true)
  })
})
