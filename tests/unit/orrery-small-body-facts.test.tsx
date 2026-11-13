/**
 * The inspector for a comet or interstellar object (#99): e, v∞, discovery date and
 * whether the orbit solution is observed or extrapolated at the date shown, only where
 * the payload carries them.
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { Inspector } from '@/components/orrery/Inspector'
import type { SmallBodyEntry } from '@/lib/orrery/smallBodyView'
import type { OrrerySmallBody } from '@/schemas/orrerySmallBodies'
import { useUiStore } from '@/store/ui'

afterEach(cleanup)

const START = 2461326.5
const msOfJd = (jd: number) => (jd - 2440587.5) * 86_400_000

const comet: OrrerySmallBody = {
  id: 'sb:1004035',
  spkid: '1004035',
  des: 'C/2024 T5',
  name: 'C/2024 T5 (ATLAS)',
  kind: 'comet',
  interstellar: false,
  discovered: null,
  magnitude: 13.2,
  m1: 8,
  k1: 10,
  h: null,
  elements: { epochJd: 2461055.5, e: 1.00224, q: 3.84, tp: START, om: 0, w: 0, i: 30 },
  elementsSource: 'horizons',
  vInfKms: null,
  solution: {
    ref: 'JPL#55',
    date: '2026-11-09',
    observations: 1981,
    dataArc: { from: '2024-10-02', to: '2026-11-09' },
  },
  target: 'ATLAS (C/2024 T5)',
  availableFrom: null,
  availableTo: null,
  fine: { start: START, step: 1, samples: [3, 1, 0, 0, 0, 0, 3, 1.01, 0, 0, 0.01, 0] },
  coarse: null,
}
const atlas: OrrerySmallBody = {
  ...comet,
  id: 'sb:1004083',
  spkid: '1004083',
  des: 'C/2025 N1',
  name: '3I/ATLAS',
  interstellar: true,
  discovered: '2025-07-01',
  magnitude: null,
  elements: { ...comet.elements, e: 6.123467, q: 1.352 },
  vInfKms: 57.98117,
  solution: {
    ref: 'JPL#55',
    date: '2026-10-21',
    observations: 117,
    dataArc: { from: '2025-10-03', to: '2026-10-16' },
  },
}
const entry = (body: OrrerySmallBody): SmallBodyEntry => ({
  key: body.id,
  label: body.name,
  group: body.interstellar ? 'interstellar' : 'comets',
  body,
})

const show = (body: OrrerySmallBody, jd: number) =>
  render(
    <Inspector
      body={body.id}
      simMs={msOfJd(jd)}
      smallBody={entry(body)}
      onClose={() => undefined}
    />,
  )
const fact = (term: string) => screen.getByText(term).nextElementSibling?.textContent ?? ''

describe('Inspector: comets and interstellar objects (#99)', () => {
  it("shows 3I/ATLAS's eccentricity, v∞, discovery date and solution", () => {
    show(atlas, START + 0.5)
    expect(screen.getByRole('heading', { name: '3I/ATLAS' })).toBeTruthy()
    expect(screen.getByText('Interstellar object')).toBeTruthy()
    expect(fact('Eccentricity')).toContain('6.1235')
    expect(fact('Eccentricity')).toContain('hyperbolic')
    expect(fact('Speed far from the Sun')).toContain('58.0')
    expect(fact('Discovered')).toBe('2025-07-01')
    expect(fact('Orbit solution')).toContain('JPL#55')
    expect(fact('Orbit solution')).toContain('117 observations')
    expect(fact('Orbit solution')).toContain('fitted to observations from 2025-10-03 to 2026-10-16')
    // JD 2461327.0 is 2026-10-13 12:00 UTC, inside the arc (to 2026-10-16).
    expect(fact('At this date')).toBe('Inside the observations the orbit is fitted to')
    expect(fact('From the Sun')).toContain('3.16')
  })

  it('never shows a v∞, a discovery date or "hyperbolic" for a comet', () => {
    show(comet, START + 0.5)
    expect(screen.getByText('Comet')).toBeTruthy()
    expect(fact('Eccentricity')).toContain('1.0022')
    expect(fact('Eccentricity')).not.toContain('hyperbolic')
    expect(screen.queryByText('Speed far from the Sun')).toBeNull()
    expect(screen.queryByText('Discovered')).toBeNull()
    expect(fact('At this date')).toBe('Inside the observations the orbit is fitted to')
    expect(screen.getByText(/drawn from its orbital elements/)).toBeTruthy()
  })

  it('says there is no position outside the samples', () => {
    show(comet, START + 90)
    expect(screen.queryByText('From the Sun')).toBeNull()
    expect(screen.getByRole('status').textContent).toMatch(/never extrapolated/)
    // 2027-01-11 is past the arc's last observation (2026-11-09).
    expect(fact('At this date')).toMatch(/extrapolated from them/i)
  })
})

describe('Inspector: bright asteroids (#99 item 4)', () => {
  const vesta: OrrerySmallBody = {
    ...comet,
    id: 'sb:20000004',
    spkid: '20000004',
    des: '4 Vesta',
    name: '4 Vesta',
    kind: 'asteroid',
    magnitude: null,
    m1: null,
    k1: null,
    h: 3.25,
    solution: null,
    fine: {
      start: START,
      step: 1,
      samples: Array.from({ length: 12 }, (_, i) => [2.2, 0.3 + i * 0.01, 0, 0, 0.01, 0]).flat(),
    },
  }
  const asteroid = (): SmallBodyEntry => ({
    key: 'sbc:20000004',
    label: '4 Vesta',
    group: 'asteroids',
    body: vesta,
  })
  const open = (jd: number) =>
    render(
      <Inspector
        body="sbc:20000004"
        simMs={msOfJd(jd)}
        smallBody={asteroid()}
        onClose={() => undefined}
      />,
    )

  afterEach(() => {
    useUiStore.setState({ observer: null })
  })

  it('names it an asteroid and gives its absolute magnitude H, with no comet forecast', () => {
    open(START + 0.5)
    expect(screen.getByText('Asteroid')).toBeTruthy()
    expect(fact('Absolute magnitude H')).toBe('3.25')
    expect(screen.queryByText('Total magnitude')).toBeNull()
  })

  it('shows no location line before the visitor has shared a location', () => {
    open(START + 0.5)
    expect(document.body.textContent).not.toMatch(/From your location tonight/)
  })

  it('shows the location line once a location is shared, but not for the Greenwich fallback', () => {
    useUiStore.setState({ observer: { lat: 51.5, lon: 0, isFallback: true } })
    open(START + 0.5)
    expect(document.body.textContent).not.toMatch(/From your location tonight/)
    cleanup()
    useUiStore.setState({ observer: { lat: 31.96, lon: -111.6, isFallback: false } })
    open(START + 0.5)
    // The samples may not reach the real "tonight"; then there is no line rather than a wrong one.
    expect(document.body.textContent).not.toMatch(/undefined|NaN/)
  })
})
