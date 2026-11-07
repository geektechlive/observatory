/**
 * The inspector near Earth (#92): a close approach (CAD's numbers with their 3-sigma
 * range, where it is now, size, ESA's view and spec Part 12's four terms kept apart), a
 * Scout object (scores, no position), and L1 with the solar wind and the next CME.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { AsteroidFacts, L1Facts, ScoutFacts } from '@/components/orrery/NearFacts'
import { OrreryTrackSchema } from '@/schemas/orreryBodies'
import { OrreryNeoSchema } from '@/schemas/orreryNeo'

afterEach(cleanup)

const raw = JSON.parse(
  readFileSync(join(import.meta.dirname, 'fixtures/neo/orrery-neo-trim.json'), 'utf8'),
) as { neo: unknown; earth: unknown }
const neo = OrreryNeoSchema.parse(raw.neo)
const earth = OrreryTrackSchema.parse(raw.earth)
const byId = (id: string) => {
  const a = neo.approaches.find((x) => x.id === id)
  if (!a) throw new Error(id)
  return a
}
const msOf = (jd: number) => (jd - 2440587.5) * 86_400_000

describe('AsteroidFacts (#92)', () => {
  it("gives CAD's closest approach with its 3-sigma range, and where it is now", () => {
    const a = byId('sb:2026 VY2')
    const jd = a.closeApproach.jd - 1
    render(<AsteroidFacts approach={a} neo={neo} earth={earth} jd={jd} simMs={msOf(jd)} />)
    expect(screen.getByText('Closest approach')).toBeTruthy()
    expect(screen.getByText(/3-sigma/i)).toBeTruthy()
    expect(screen.getByText(/approaching/)).toBeTruthy()
    expect(screen.getAllByText(/lunar distances/).length).toBeGreaterThan(0)
  })

  it('keeps the four impact terms apart, with ESA’s modelled chance as a model', () => {
    const a = byId('sb:2026 VY2')
    render(
      <AsteroidFacts
        approach={a}
        neo={neo}
        earth={earth}
        jd={a.closeApproach.jd}
        simMs={msOf(a.closeApproach.jd)}
      />,
    )
    const list = screen.getByRole('list', { name: /impact/i })
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(4)
    expect(items[2]?.textContent).toMatch(/1 in 60,606/)
    expect(items[2]?.textContent).toMatch(/model/i)
    expect(items[3]?.textContent).toMatch(/Confirmed impact.*No/)
    expect(screen.getByText(/ESA also lists/)).toBeTruthy()
  })

  it('says so when no sample covers the date: never extrapolated', () => {
    const a = byId('sb:524522')
    const jd = a.closeApproach.jd + 40
    render(<AsteroidFacts approach={a} neo={neo} earth={earth} jd={jd} simMs={msOf(jd)} />)
    expect(screen.getByRole('status').textContent).toMatch(/no position for this date/i)
  })

  it('estimates the size from brightness when JPL has no diameter', () => {
    const a = byId('sb:2026 UE2')
    render(
      <AsteroidFacts
        approach={a}
        neo={neo}
        earth={earth}
        jd={a.closeApproach.jd}
        simMs={msOf(a.closeApproach.jd)}
      />,
    )
    expect(screen.getByText(/about \d+–\d+ m/)).toBeTruthy()
  })
})

describe('ScoutFacts (#92)', () => {
  it('shows the scores and uncertainty, and that there is no position', () => {
    const o = neo.scout?.objects[0]
    if (!o) throw new Error('fixture lacks Scout')
    render(<ScoutFacts object={o} />)
    expect(screen.getByText(/unconfirmed/i)).toBeTruthy()
    expect(screen.getByText(/no position/i)).toBeTruthy()
    expect(screen.getAllByText(/%/).length).toBeGreaterThan(0)
  })
})

describe('L1Facts (#92)', () => {
  it('gives the solar wind at L1, how long it takes to reach Earth, and the next CME', () => {
    render(
      <L1Facts
        wind={{ speed: 400, density: 5.2, bz: -3.1, updatedAt: '2026-11-07T12:00:00Z' }}
        cme={{ inbound: true, arrival: '2026-11-09T06:00:00Z' }}
      />,
    )
    expect(screen.getByText(/400/)).toBeTruthy()
    expect(screen.getByText(/63 min/)).toBeTruthy()
    expect(screen.getByText(/2026-11-09/)).toBeTruthy()
    expect(screen.getByText(/no position/i)).toBeTruthy()
  })

  it('says when no CME is on its way', () => {
    render(<L1Facts wind={null} cme={{ inbound: false, arrival: null }} />)
    expect(screen.getByText(/no Earth-directed CME/i)).toBeTruthy()
  })
})
