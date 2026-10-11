/**
 * Earth and Orbit console panels after the ROCI v2 reskin (#55). The panels
 * share PanelState for their states, carry status on the status scale rather
 * than ad-hoc green/amber aliases, and the launch countdown no longer announces
 * every second through a live region.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { DsnPanel } from '@/components/panels/DsnPanel'
import { LaunchPanel } from '@/components/panels/LaunchPanel'
import { PeopleInSpacePanel } from '@/components/panels/PeopleInSpacePanel'
import type { DsnData } from '@/lib/dsn'
import type { LaunchesResponse } from '@/schemas/launches'

const launches = vi.hoisted(() => ({
  data: null as LaunchesResponse | null,
  isLoading: false,
  error: null as Error | null,
}))
const dsn = vi.hoisted(() => ({
  data: null as DsnData | null,
  isLoading: false,
  error: null as Error | null,
}))
const people = vi.hoisted(() => ({
  data: null as { number: number; expedition: string | null; people: never[] } | null,
  isLoading: false,
  error: null as Error | null,
}))

vi.mock('@/hooks/useLaunches', () => ({ useLaunches: () => launches }))
vi.mock('@/hooks/useNow', () => ({ useNow: () => new Date('2026-10-11T00:00:00Z') }))
vi.mock('@/hooks/useDsn', () => ({ useDsn: () => dsn }))
vi.mock('@/hooks/usePeopleInSpace', () => ({ usePeopleInSpace: () => people }))

afterEach(cleanup)

function wrap(children: ReactNode) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
}

function launch(overrides: Partial<LaunchesResponse['result'][number]>) {
  return { id: 1, name: 'Starship Flight', sort_date: '0', ...overrides }
}

describe('LaunchPanel', () => {
  it('renders the shared state primitive while loading', () => {
    launches.data = null
    launches.isLoading = true
    render(wrap(<LaunchPanel />))
    expect(screen.getByRole('status').textContent).toMatch(/loading/i)
  })

  it('puts a firm T-0 on the nominal status token and skips the per-second live region', () => {
    launches.isLoading = false
    launches.data = {
      valid_auth: true,
      count: 1,
      result: [launch({ t0: '2026-10-12T00:00:00Z' })],
    }
    const { container } = render(wrap(<LaunchPanel />))
    expect(container.querySelector('[aria-live]')).toBeNull()
    expect(screen.getByText('GO').getAttribute('style')).toContain('var(--terminal)')
    expect(screen.getByText(/T- 1d 00:00:00/)).toBeTruthy()
  })

  it('puts a window-only launch on the watch token', () => {
    launches.data = {
      valid_auth: true,
      count: 1,
      result: [launch({ win_open: '2026-10-12T00:00:00Z' })],
    }
    render(wrap(<LaunchPanel />))
    expect(screen.getByText('TBC').getAttribute('style')).toContain('var(--amber)')
  })
})

describe('DsnPanel', () => {
  it('marks each radio band with a swatch instead of colouring the letter', () => {
    dsn.data = {
      stations: [
        {
          name: 'gdscc',
          friendlyName: 'Goldstone',
          dishes: [
            {
              name: 'DSS24',
              activity: 'track',
              contacts: [
                { spacecraft: 'VGR1', rtlt: 10, bands: ['X', 'Ka'], hasUp: true, hasDown: true },
              ],
            },
          ],
        },
      ],
    }
    const { container } = render(wrap(<DsnPanel />))
    expect(screen.getByRole('heading', { level: 2, name: 'Deep Space Network' })).toBeTruthy()
    expect(screen.getByText('Goldstone')).toBeTruthy()
    const bands = screen.getAllByText(/^(X|Ka)$/)
    expect(bands).toHaveLength(2)
    for (const band of bands) expect(band.getAttribute('style')).toBeNull()
    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThanOrEqual(3)
  })

  it('names the upstream in the unavailable state', () => {
    dsn.data = null
    dsn.error = new Error('boom')
    render(wrap(<DsnPanel />))
    expect(screen.getByText(/DSN Now/)).toBeTruthy()
  })
})

describe('PeopleInSpacePanel', () => {
  it('renders the headcount as a mono readout, not display type', () => {
    people.data = { number: 12, expedition: '74', people: [] }
    render(wrap(<PeopleInSpacePanel />))
    const count = screen.getByText('12')
    expect(count.closest('[data-tone]')?.getAttribute('data-tone')).toBe('signal')
  })
})
