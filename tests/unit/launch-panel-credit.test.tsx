/**
 * RocketLaunch.live asks that "Data by RocketLaunch.Live" be shown "somewhere near the data"
 * (rocketlaunch.live/api, read 2026-11-08; #179).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { LaunchPanel } from '@/components/panels/LaunchPanel'

const launches = vi.hoisted(() => ({
  useLaunches: vi.fn<() => { data: unknown; isLoading: boolean; error: Error | null }>(),
}))
vi.mock('@/hooks/useLaunches', () => launches)

const LAUNCH = {
  id: 1,
  name: 'Starlink Group 12-1',
  sort_date: '1762650000',
  t0: '2026-11-09T01:00:00Z',
  slug: 'starlink-group-12-1',
  vehicle: { id: 1, name: 'Falcon 9' },
}

function renderPanel(): void {
  const client = new QueryClient()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  render(<LaunchPanel />, { wrapper })
}

afterEach(() => {
  cleanup()
})

describe('LaunchPanel credit (#179)', () => {
  it('says "Data by RocketLaunch.Live", linked, under the launches', () => {
    launches.useLaunches.mockReturnValue({
      data: { result: [LAUNCH] },
      isLoading: false,
      error: null,
    })
    renderPanel()
    const credit = screen.getByRole('link', { name: 'Data by RocketLaunch.Live' })
    expect(credit.getAttribute('href')).toBe('https://www.rocketlaunch.live/')
  })

  it('shows no credit when there is no data to credit', () => {
    launches.useLaunches.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('x'),
    })
    renderPanel()
    expect(screen.queryByRole('link', { name: 'Data by RocketLaunch.Live' })).toBeNull()
  })
})
