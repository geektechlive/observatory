/**
 * Comets and interstellar objects in the Find box and the controls (#99): listed once
 * loaded, marked when no sample covers the date, and the switch group's status line.
 */
import { describe, expect, it } from 'vitest'

import { smallBodyCatalog } from '@/components/orrery/catalog'
import { type SmallBodyEntry, smallBodyStatus } from '@/lib/orrery/smallBodyView'
import type { OrrerySmallBody } from '@/schemas/orrerySmallBodies'

const START = 2461326.5
const body = (id: string, name: string, interstellar: boolean): OrrerySmallBody => ({
  id,
  spkid: id.slice(3),
  des: name,
  name,
  kind: 'comet',
  interstellar,
  discovered: null,
  magnitude: null,
  m1: null,
  k1: null,
  h: null,
  elements: { epochJd: START, e: 0.9, q: 1, tp: START, om: 0, w: 0, i: 0 },
  elementsSource: 'horizons',
  vInfKms: null,
  solution: null,
  target: null,
  availableFrom: null,
  availableTo: null,
  fine: { start: START, step: 1, samples: [1, 0, 0, 0, 0, 0, 1, 0.01, 0, 0, 0, 0] },
  coarse: null,
})
const entries: SmallBodyEntry[] = [
  { key: 'sb:1', label: 'C/2026 A2 (Bok)', group: 'comets', body: body('sb:1', 'Bok', false) },
  { key: 'sb:2', label: '3I/ATLAS', group: 'interstellar', body: body('sb:2', '3I', true) },
]

describe('smallBodyCatalog', () => {
  it('lists each under its group, available where a sample covers the date', () => {
    expect(smallBodyCatalog(entries, START + 0.5)).toEqual([
      {
        key: 'sb:1',
        label: 'C/2026 A2 (Bok)',
        kind: 'smallbody',
        group: 'Comets',
        available: true,
      },
      {
        key: 'sb:2',
        label: '3I/ATLAS',
        kind: 'smallbody',
        group: 'Interstellar objects',
        available: true,
      },
    ])
    expect(smallBodyCatalog(entries, START + 5).every((i) => !i.available)).toBe(true)
  })
})

describe('smallBodyStatus', () => {
  it('says nothing while both switches are off and nothing was asked for', () => {
    expect(smallBodyStatus({ status: 'pending', enabled: false, comets: 0, interstellar: 0 })).toBe(
      '',
    )
  })

  it('says it is loading, then what it has, then why there is none', () => {
    expect(smallBodyStatus({ status: 'pending', enabled: true, comets: 0, interstellar: 0 })).toBe(
      'Loading from JPL Horizons…',
    )
    expect(smallBodyStatus({ status: 'success', enabled: true, comets: 12, interstellar: 3 })).toBe(
      '12 comets and 3 interstellar objects, from JPL Horizons',
    )
    expect(smallBodyStatus({ status: 'success', enabled: true, comets: 1, interstellar: 1 })).toBe(
      '1 comet and 1 interstellar object, from JPL Horizons',
    )
    expect(smallBodyStatus({ status: 'error', enabled: true, comets: 0, interstellar: 0 })).toBe(
      'Comet data is not available right now.',
    )
  })
})
