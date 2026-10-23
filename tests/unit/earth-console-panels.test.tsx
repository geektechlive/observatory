/**
 * The Earth console's Seismic, Geomagnetic and Weather alerts panels (#63):
 * rows from data, ordering, the top-4 limit, and the loading / unavailable /
 * empty states on the shared PanelState primitive.
 */
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { GeomagKpPanel } from '@/components/panels/GeomagKpPanel'
import { NwsAlertsPanel } from '@/components/panels/NwsAlertsPanel'
import { SeismicPanel } from '@/components/panels/SeismicPanel'
import type { NwsAlerts } from '@/schemas/nws'
import type { QuakesResponse } from '@/schemas/quakes'
import type { SolarWind } from '@/schemas/solarWind'

const NOW = new Date('2026-10-18T12:00:00Z')
const HOUR = 3_600_000

interface Query<T> {
  data: T | undefined
  isLoading: boolean
  error: Error | null
}
const quakes = vi.hoisted((): Query<QuakesResponse> => ({
  data: undefined,
  isLoading: false,
  error: null,
}))
const wind = vi.hoisted((): Query<SolarWind> => ({
  data: undefined,
  isLoading: false,
  error: null,
}))
const nws = vi.hoisted((): Query<NwsAlerts> => ({ data: undefined, isLoading: false, error: null }))

vi.mock('@/hooks/useQuakes', () => ({ useQuakes: () => quakes }))
vi.mock('@/hooks/useSolarWind', () => ({ useSolarWind: () => wind }))
vi.mock('@/hooks/useNwsAlerts', () => ({ useNwsAlerts: () => nws }))
vi.mock('@/hooks/useNow', () => ({ useNow: () => NOW }))

afterEach(() => {
  cleanup()
  for (const q of [quakes, wind, nws] as Query<unknown>[]) {
    q.data = undefined
    q.isLoading = false
    q.error = null
  }
})

function quake(id: string, mag: number | null, hoursAgo: number, place = `Place ${id}`) {
  return {
    id,
    mag,
    place,
    lat: 0,
    lon: 0,
    depthKm: 10,
    time: NOW.getTime() - hoursAgo * HOUR,
    tsunami: false,
    url: '',
  }
}

describe('SeismicPanel', () => {
  it('shows a loading state', () => {
    quakes.isLoading = true
    render(<SeismicPanel />)
    expect(screen.getByRole('status').getAttribute('data-kind')).toBe('loading')
  })

  it('shows unavailable on error', () => {
    quakes.error = new Error('down')
    render(<SeismicPanel />)
    expect(screen.getByRole('status').getAttribute('data-kind')).toBe('unavailable')
  })

  it('shows an empty state when nothing happened in 24 h', () => {
    quakes.data = { updatedAt: NOW.toISOString(), quakes: [quake('a', 6, 30)] }
    render(<SeismicPanel />)
    expect(screen.getByRole('status').getAttribute('data-kind')).toBe('empty')
    expect(screen.getByText('No quakes in the last 24 hours')).toBeTruthy()
  })

  it('lists the strongest four of the last 24 h, strongest first', () => {
    quakes.data = {
      updatedAt: NOW.toISOString(),
      quakes: [
        quake('a', 4.2, 1),
        quake('b', 6.1, 2, 'Tonga'),
        quake('c', 5.0, 3),
        quake('d', 7.4, 23, 'Chile'),
        quake('e', 3.1, 4),
        quake('f', 5.6, 5),
        quake('old', 8.9, 25, 'Too old'),
        quake('nomag', null, 1, 'No magnitude'),
      ],
    }
    render(<SeismicPanel />)
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(4)
    expect(within(items[0] as HTMLElement).getByText('M7.4')).toBeTruthy()
    expect(within(items[0] as HTMLElement).getByText('Chile')).toBeTruthy()
    expect(items.map((li) => within(li).getByText(/^M\d/).textContent)).toEqual([
      'M7.4',
      'M6.1',
      'M5.6',
      'M5.0',
    ])
    expect(screen.queryByText('Too old')).toBeNull()
    expect(screen.queryByText('No magnitude')).toBeNull()
  })
})

const reading = (kp: number, i: number) => ({
  time: new Date(NOW.getTime() - i * 3 * HOUR).toISOString(),
  kp,
})

function windWith(currentKp: number | null): SolarWind {
  return {
    kpReadings: [reading(2, 3), reading(3, 2), reading(currentKp ?? 2, 1)],
    currentKp,
    windSpeed: 400,
    windDensity: 5,
    imfBz: -1,
    windSpeedSeries: [],
    windDensitySeries: [],
    imfBzSeries: [],
    updatedAt: NOW.toISOString(),
  }
}

describe('GeomagKpPanel', () => {
  it('shows loading and unavailable states', () => {
    wind.isLoading = true
    const { unmount } = render(<GeomagKpPanel />)
    expect(screen.getByRole('status').getAttribute('data-kind')).toBe('loading')
    unmount()
    wind.isLoading = false
    wind.error = new Error('down')
    render(<GeomagKpPanel />)
    expect(screen.getByRole('status').getAttribute('data-kind')).toBe('unavailable')
  })

  it('reads a quiet Kp', () => {
    wind.data = windWith(2)
    render(<GeomagKpPanel />)
    expect(screen.getByTestId('kp-now').textContent).toBe('2')
    expect(screen.getByText('Kp quiet')).toBeTruthy()
  })

  it('names the G-scale at the watch and hazard boundaries', () => {
    wind.data = windWith(4.67)
    const { unmount, rerender } = render(<GeomagKpPanel />)
    expect(screen.getByText('Kp quiet')).toBeTruthy()
    wind.data = windWith(5)
    rerender(<GeomagKpPanel />)
    expect(screen.getByText('Kp watch, G1')).toBeTruthy()
    wind.data = windWith(7)
    rerender(<GeomagKpPanel />)
    expect(screen.getByText('Kp hazard, G3')).toBeTruthy()
    unmount()
  })

  it('shows one Kp number: the bars carry no second, peak readout (#63)', () => {
    wind.data = windWith(0.33)
    render(<GeomagKpPanel />)
    // The sparkline's own "Kp Index 3" header read as a contradiction next to "0.33".
    expect(screen.queryByText('Kp Index')).toBeNull()
    expect(screen.queryByText('3')).toBeNull()
    expect(screen.getByLabelText(/Kp index sparkline/)).toBeTruthy()
  })

  it('renders the Kp bars and tolerates a missing current value', () => {
    wind.data = windWith(null)
    render(<GeomagKpPanel />)
    expect(screen.getByTestId('kp-now').textContent).toBe('—')
    expect(screen.queryByText(/^Kp (quiet|watch|hazard)/)).toBeNull()
    expect(screen.getByLabelText(/Kp index sparkline/)).toBeTruthy()
  })
})

const alert = (event: string, severity: string, headline = `${event} for the county`) => ({
  geometry: null,
  event,
  severity,
  headline,
})

describe('NwsAlertsPanel', () => {
  it('shows loading and unavailable states', () => {
    nws.isLoading = true
    const { unmount } = render(<NwsAlertsPanel />)
    expect(screen.getByRole('status').getAttribute('data-kind')).toBe('loading')
    unmount()
    nws.isLoading = false
    nws.error = new Error('down')
    render(<NwsAlertsPanel />)
    expect(screen.getByRole('status').getAttribute('data-kind')).toBe('unavailable')
  })

  it('shows an empty state', () => {
    nws.data = { features: [], updatedAt: NOW.toISOString() }
    render(<NwsAlertsPanel />)
    expect(screen.getByRole('status').getAttribute('data-kind')).toBe('empty')
    expect(screen.getByText('No active US weather alerts')).toBeTruthy()
  })

  it('sorts by severity, limits to four, and tags each row with its tier', () => {
    nws.data = {
      updatedAt: NOW.toISOString(),
      features: [
        alert('Wind Advisory', 'Minor'),
        alert('Flood Watch', 'Moderate'),
        alert('Heat Advisory', 'Unknown'),
        alert('Tornado Warning', 'Extreme'),
        alert('Severe Thunderstorm Warning', 'Severe'),
        alert('Frost Advisory', 'Minor'),
      ],
    }
    render(<NwsAlertsPanel />)
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(4)
    expect(items.map((li) => li.getAttribute('data-tier'))).toEqual([
      'extreme',
      'severe',
      'moderate',
      'minor',
    ])
    expect(within(items[0] as HTMLElement).getByText('Extreme')).toBeTruthy()
    expect(within(items[0] as HTMLElement).getByText('Tornado Warning')).toBeTruthy()
    expect(screen.queryByText('Heat Advisory')).toBeNull()
  })

  it('shows the headline as the area line', () => {
    nws.data = {
      updatedAt: NOW.toISOString(),
      features: [alert('Flood Watch', 'Moderate', 'Flood Watch issued for Douglas County')],
    }
    render(<NwsAlertsPanel />)
    expect(screen.getByText('Flood Watch issued for Douglas County')).toBeTruthy()
  })
})
