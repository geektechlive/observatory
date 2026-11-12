/**
 * The inspector for a satellite (#98): name, NORAD id, group, height above Earth and how
 * old its orbit data is, and plainly "no position" outside its epoch window.
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { SatFacts } from '@/components/orrery/SatFacts'
import { EARTH_RADIUS_KM } from '@/lib/orrery/earthFrame'

afterEach(cleanup)

const T0 = Date.parse('2026-11-07T12:00:00Z')

describe('<SatFacts> (#98)', () => {
  it('shows the id, group, height and data age', () => {
    render(
      <SatFacts
        info={{
          key: 'sat:25544',
          noradId: '25544',
          name: 'ISS (ZARYA)',
          group: 'stations',
          epochMs: T0 - 5 * 3_600_000,
          teme: [EARTH_RADIUS_KM + 418.4, 0, 0],
        }}
        simMs={T0}
      />,
    )
    const text = document.body.textContent
    expect(text).toMatch(/NORAD 25544/)
    expect(text).toMatch(/Space stations/)
    expect(screen.getByText('418')).toBeTruthy()
    expect(text).toMatch(/5 h before this date/)
    expect(text).toMatch(/CelesTrak/)
  })

  it('credits SpaceX’s ephemerides for a Starlink on SupGP elements, and only then (#209)', () => {
    const starlink = {
      key: 'sat:44714',
      noradId: '44714',
      name: 'STARLINK-1008',
      group: 'starlink' as const,
      epochMs: T0 - 3_600_000,
      teme: [EARTH_RADIUS_KM + 550, 0, 0] as [number, number, number],
    }
    const { unmount } = render(<SatFacts info={{ ...starlink, supgp: true }} simMs={T0} />)
    expect(document.body.textContent).toMatch(
      /CelesTrak supplemental GP, fitted to SpaceX’s published Starlink ephemerides/,
    )
    unmount()
    render(<SatFacts info={starlink} simMs={T0} />)
    expect(document.body.textContent).toMatch(/CelesTrak GP data \(OMM\)/)
    expect(document.body.textContent).not.toMatch(/SpaceX’s published/)
  })

  it('adds Space-Track’s catalogue, ESA DISCOS’s physical facts and a re-entry, each credited (#101)', () => {
    render(
      <SatFacts
        info={{
          key: 'sat:45700',
          noradId: '45700',
          name: 'STARLINK-1400',
          group: 'starlink',
          epochMs: T0 - 3_600_000,
          teme: [EARTH_RADIUS_KM + 210, 0, 0],
        }}
        simMs={T0}
        catalog={{
          noradId: '45700',
          intlDes: '2020-035AV',
          objectType: 'PAYLOAD',
          country: 'US',
          launch: '2020-06-04',
          site: 'AFETR',
          rcsSize: 'LARGE',
        }}
        physical={{
          satno: '45700',
          cosparId: '2020-035AV',
          name: 'Starlink-1400',
          objectClass: 'Payload',
          massKg: 260,
          shape: 'Box + 1 Pan',
          widthM: 2.8,
          heightM: 0.2,
          depthM: 1.4,
          diameterM: null,
          spanM: 11,
          operators: ['SpaceX'],
          firstEpoch: '2020-06-04',
          fetchedAt: '2026-11-07T22:23:18Z',
        }}
        reentry={{
          noradId: '45700',
          decayEpoch: '2026-11-11T20:32:00Z',
          windowMin: 780,
          msgEpoch: '2026-11-07T20:06:00Z',
          lat: null,
          lon: null,
          highInterest: false,
        }}
      />,
    )
    const text = document.body.textContent
    expect(text).toMatch(/Satellite or spacecraft/)
    expect(text).toMatch(/United States/)
    expect(text).toMatch(/2020-06-04/)
    expect(text).toMatch(/Large on radar/)
    expect(text).toMatch(/260/)
    expect(text).toMatch(/SpaceX/)
    expect(text).toMatch(/2\.8 × 0\.2 × 1\.4 m/)
    expect(text).toMatch(/Predicted to re-enter 11 Nov 20:32 UTC, give or take 13 h/)
    expect(text).toMatch(/Space-Track\.org/)
    expect(text).toMatch(/ESA DISCOS/)
  })

  it('says when it has no position at this date', () => {
    render(
      <SatFacts
        info={{
          key: 'sat:25544',
          noradId: '25544',
          name: 'ISS (ZARYA)',
          group: 'stations',
          epochMs: T0 - 10 * 86_400_000,
          teme: null,
        }}
        simMs={T0}
      />,
    )
    expect(document.body.textContent).toMatch(/No position at this date/)
  })

  it('never says "no position" while its position is still being worked out (#206)', () => {
    render(
      <SatFacts
        info={{
          key: 'sat:40059',
          noradId: '40059',
          name: 'OCO 2',
          group: 'science',
          epochMs: T0 - 13 * 3_600_000,
          teme: null,
          pending: true,
          computed: false,
        }}
        simMs={T0}
      />,
    )
    const text = document.body.textContent
    expect(text).not.toMatch(/No position/)
    expect(text).toMatch(/Working out its position/)
    expect(text).toMatch(/13 h before this date/)
  })

  it('says neither when no pass is coming and none has landed (#206)', () => {
    render(
      <SatFacts
        info={{
          key: 'sat:40059',
          noradId: '40059',
          name: 'OCO 2',
          group: 'science',
          epochMs: T0 - 13 * 3_600_000,
          teme: null,
          pending: false,
          computed: false,
        }}
        simMs={T0}
      />,
    )
    const text = document.body.textContent
    expect(text).not.toMatch(/No position at this date/)
    expect(text).not.toMatch(/Working out/)
    expect(text).toMatch(/Position not available right now/)
  })
})
