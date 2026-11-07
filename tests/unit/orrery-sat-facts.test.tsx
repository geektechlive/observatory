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
})
