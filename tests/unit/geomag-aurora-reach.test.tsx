/**
 * The Geomagnetic panel says how far the aurora reaches (#77): overhead from the
 * OVATION likely (10%) edge, and on the horizon about 9° further. Hooks are mocked.
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { GeomagKpPanel } from '@/components/panels/GeomagKpPanel'

const state = vi.hoisted((): { aurora: unknown } => ({ aurora: null }))

vi.mock('@/hooks/useSolarWind', () => ({
  useSolarWind: () => ({
    data: { currentKp: 4, kpReadings: [], updatedAt: '2026-10-27T12:00:00Z' },
    isLoading: false,
    error: null,
  }),
}))
vi.mock('@/hooks/useAurora', () => ({ useAurora: () => state.aurora }))

afterEach(cleanup)

const reach = (n: [number, number][], s: [number, number][]) => ({
  data: {
    points: [],
    reach: { likely: { n, s }, possible: { n: [], s: [] } },
    observationTime: '',
    forecastTime: '',
    updatedAt: '',
  },
})

describe('GeomagKpPanel aurora reach', () => {
  it('names the furthest reach overhead and on the horizon, in each hemisphere', () => {
    state.aurora = reach(
      [
        [-100, 55],
        [-95, 52],
      ],
      [[140, -60]],
    )
    render(<GeomagKpPanel />)
    expect(screen.getByText('52°N')).toBeTruthy()
    expect(screen.getByText('~43°N')).toBeTruthy()
    expect(screen.getByText('60°S')).toBeTruthy()
    expect(screen.getByText('~51°S')).toBeTruthy()
  })

  it('says quiet for a hemisphere with no likely aurora', () => {
    state.aurora = reach([[-95, 64]], [])
    render(<GeomagKpPanel />)
    expect(screen.getByText('64°N')).toBeTruthy()
    expect(screen.getAllByText(/quiet/i).length).toBeGreaterThan(0)
  })

  it('shows no reach rows before the aurora data arrives', () => {
    state.aurora = { data: undefined }
    render(<GeomagKpPanel />)
    expect(screen.queryByText(/overhead/i)).toBeNull()
  })
})
