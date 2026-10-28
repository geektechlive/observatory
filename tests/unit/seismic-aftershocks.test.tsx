/**
 * The Seismic panel shows USGS's aftershock odds under the last day's quakes (#76).
 * Hooks are mocked; the endpoint is covered in functions/aftershocks.test.ts.
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { SeismicPanel } from '@/components/panels/SeismicPanel'

const NOW = Date.parse('2026-10-27T12:00:00Z')
const state = vi.hoisted((): { aftershocks: unknown } => ({ aftershocks: null }))

vi.mock('@/hooks/useQuakes', () => ({
  useQuakes: () => ({
    data: {
      quakes: [{ id: 'q1', mag: 4.8, place: 'off Honshu', time: NOW - 3_600_000, lat: 0, lon: 0 }],
      updatedAt: new Date(NOW).toISOString(),
    },
    isLoading: false,
    error: null,
  }),
}))
vi.mock('@/hooks/useAftershocks', () => ({ useAftershocks: () => state.aftershocks }))
vi.mock('@/hooks/useNow', () => ({ useNow: () => new Date(NOW) }))

afterEach(cleanup)

const PANAMA = {
  id: 'us6000u18k',
  mag: 7.7,
  place: '12 km WSW of Pitaloza Arriba, Panama',
  time: NOW - 6 * 86_400_000,
  url: 'https://earthquake.usgs.gov/earthquakes/eventpage/us6000u18k',
  day: { m5: 0.0801, m6: 0.008 },
  week: { m5: 0.3919, m6: 0.0479 },
}

describe('SeismicPanel aftershock odds', () => {
  it("shows each forecast's week odds, linked to the USGS event page", () => {
    state.aftershocks = { data: { forecasts: [PANAMA], updatedAt: '' } }
    render(<SeismicPanel />)
    expect(screen.getByText(/Aftershock odds/i)).toBeTruthy()
    expect(screen.getByText('39%')).toBeTruthy()
    expect(screen.getByText('5%')).toBeTruthy()
    const link = screen.getByRole('link', { name: /M7\.7.*Panama/ })
    expect(link.getAttribute('href')).toBe(PANAMA.url)
  })

  it('shows a tiny chance as under 1%, never as 0%', () => {
    state.aftershocks = {
      data: { forecasts: [{ ...PANAMA, week: { m5: 0.12, m6: 0.004 } }], updatedAt: '' },
    }
    render(<SeismicPanel />)
    expect(screen.getByText('<1%')).toBeTruthy()
  })

  it('shows no odds block when no quake has a forecast, or the feed is down', () => {
    state.aftershocks = { data: { forecasts: [], updatedAt: '' } }
    render(<SeismicPanel />)
    expect(screen.queryByText(/Aftershock odds/i)).toBeNull()
    cleanup()
    state.aftershocks = { data: undefined, error: new Error('down') }
    render(<SeismicPanel />)
    expect(screen.queryByText(/Aftershock odds/i)).toBeNull()
    expect(screen.getByText('off Honshu')).toBeTruthy()
  })
})
