/**
 * Charon in the inspector (#99): its distance from the Pluto barycentre, the days the site
 * carries, JPL's own window, and that the pair is drawn to Pluto's scale. Outside its
 * samples it says so and shows no position.
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Inspector } from '@/components/orrery/Inspector'
import { CHARON_KEY } from '@/lib/orrery/dwarfs'
import { dwarfEntries } from '@/lib/orrery/dwarfView'
import type { OrreryDwarfs } from '@/schemas/orreryDwarfs'

const R_AU = 17_470 / 149_597_870.7
const START_MS = Date.UTC(2026, 9, 28)
const fine = () => {
  const samples: number[] = []
  for (let k = 0; k <= 120; k += 1) samples.push(R_AU, 0, 0, 0, 0, 0)
  return { start: START_MS / 86_400_000 + 2440587.5, step: 0.25, samples }
}
const coarse = () => {
  const samples: number[] = []
  for (let k = 0; k < 11; k += 1) samples.push(35, 10, 1)
  return { start: 2451544.5, step: 1826, samples }
}
const entries = dwarfEntries({
  dwarfs: [
    {
      id: 'sb:20134340',
      spkid: '20134340',
      name: 'Pluto',
      target: 'Pluto Barycenter (9)',
      availableFrom: null,
      availableTo: null,
      coarse: coarse(),
    },
  ],
  charon: {
    id: 'naif:901',
    naifId: '901',
    name: 'Charon',
    parentSpkid: '20134340',
    center: '500@9',
    target: 'Charon (901)',
    fine: fine(),
  },
} as unknown as OrreryDwarfs)
const charon = entries.find((e) => e.key === CHARON_KEY)

afterEach(cleanup)

function show(simMs: number) {
  if (!charon) throw new Error('no Charon')
  render(<Inspector body={charon.key} smallBody={charon} simMs={simMs} onClose={vi.fn()} />)
}

describe("Charon's inspector", () => {
  it('says where it is, what places it, and the scale it is drawn at', () => {
    show(START_MS + 10 * 86_400_000)
    expect(screen.getByRole('heading', { name: 'Charon' })).toBeTruthy()
    expect(screen.getByText('Moon of Pluto')).toBeTruthy()
    expect(screen.getByText('17,470 km')).toBeTruthy()
    expect(screen.getByText(/"Charon \(901\)" from the Pluto system's barycentre/)).toBeTruthy()
    expect(screen.getByText(/JPL's ephemeris covers 1800 to 2199/)).toBeTruthy()
    expect(screen.getByText(/drawn to Pluto's own scale, magnified/)).toBeTruthy()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('says when its samples do not cover the date, and never extrapolates', () => {
    show(START_MS + 365 * 86_400_000)
    expect(screen.getByRole('status').textContent).toMatch(
      /samples for 2026-10-28 to 2026-11-27 only/,
    )
    expect(screen.queryByText('From the barycentre')).toBeNull()
  })
})
