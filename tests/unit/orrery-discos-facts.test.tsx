/**
 * ESA DISCOS's facts in the inspector (#101), for spacecraft (CraftFacts) and satellites
 * (SatFacts): mass in kg and lb, size, operator, and the credit with DISCOS's own name.
 * Values from the live dry run (2026-11-07): Voyager 1.
 */
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { DiscosFacts } from '@/components/orrery/DiscosFacts'

afterEach(cleanup)

const VOYAGER_1 = {
  satno: '10321',
  cosparId: '1977-084A',
  name: 'Voyager 1',
  objectClass: 'Payload',
  massKg: 817.64,
  shape: 'Cyl + 1 Ant',
  widthM: null,
  heightM: 0.47,
  depthM: null,
  diameterM: 1.78,
  spanM: 13,
  operators: ['Jet Propulsion Lab'],
  firstEpoch: '1977-09-05',
  fetchedAt: '2026-11-07T22:23:18Z',
}

describe('<DiscosFacts> (#101)', () => {
  it('shows mass, size, operator and credits ESA DISCOS', () => {
    render(
      <dl>
        <DiscosFacts object={VOYAGER_1} />
      </dl>,
    )
    const text = document.body.textContent
    expect(text).toMatch(/Mass818\s*kg/)
    expect(text).toMatch(/1,803 lb/)
    expect(text).toMatch(/1\.8 m wide, 0\.5 m tall, 13 m across/)
    expect(text).toMatch(/Jet Propulsion Lab/)
    expect(text).toMatch(/ESA DISCOS: Voyager 1/)
  })

  it('leaves out what DISCOS doesn’t have', () => {
    render(
      <dl>
        <DiscosFacts
          object={{
            ...VOYAGER_1,
            massKg: null,
            heightM: null,
            diameterM: null,
            spanM: null,
            operators: [],
          }}
        />
      </dl>,
    )
    const text = document.body.textContent
    expect(text).not.toMatch(/Mass/)
    expect(text).not.toMatch(/Size/)
    expect(text).not.toMatch(/Operator/)
    expect(text).toMatch(/ESA DISCOS/)
  })
})
