/**
 * The Tonight panel (#78): twelve hours of darkness and moon at the user's location.
 * It asks for nothing until the user clicks, and it shares the location with Sun & Moon.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { TonightPanel } from '@/components/panels/TonightPanel'
import type * as GeoModule from '@/hooks/useGeolocation'
import { useUiStore } from '@/store/ui'

const NOW = new Date('2026-10-27T22:40:00Z')
const state = vi.hoisted(() => ({ request: vi.fn(), now: new Date('2026-10-27T22:40:00Z') }))

vi.mock('@/hooks/useNow', () => ({ useNow: () => state.now }))
const clouds = vi.hoisted(() => ({
  useClouds: vi.fn<(observer: unknown) => { data: unknown }>(() => ({ data: undefined })),
}))
vi.mock('@/hooks/useClouds', () => clouds)
vi.mock('@/hooks/useSunMoon', () => ({
  useSunMoon: () => ({ data: { fracIllum: 97, curPhase: 'Waning Gibbous' } }),
}))
vi.mock('@/hooks/useGeolocation', async (importActual) => {
  const actual = await importActual<typeof GeoModule>()
  return {
    ...actual,
    useGeolocation: () => {
      const real = actual.useGeolocation()
      return { ...real, request: state.request }
    },
  }
})

afterEach(() => {
  cleanup()
  useUiStore.setState({ observer: null, geoStatus: null })
  state.request.mockReset()
  state.now = NOW
})

describe('TonightPanel', () => {
  it('asks before using the location, and draws no strip until then', () => {
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition: vi.fn() } })
    render(<TonightPanel />)
    vi.unstubAllGlobals()
    expect(document.querySelectorAll('[data-darkness]')).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'Use my location' }))
    expect(state.request).toHaveBeenCalledOnce()
  })

  it('draws twelve hours of darkness and moon once the location is known', () => {
    useUiStore.setState({ observer: { lat: 39.1, lon: -94.6, isFallback: false } })
    render(<TonightPanel />)
    const slots = document.querySelectorAll('[data-darkness]')
    expect(slots).toHaveLength(12)
    // Late October, Kansas City, from 22:00 UTC: civil dusk through a fully dark night.
    const levels = [...slots].map((s) => s.getAttribute('data-darkness'))
    expect(levels).toContain('dark')
    expect(levels[0]).not.toBe('dark')
    expect(screen.getByText(/97% lit/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Use my location' })).toBeNull()
  })

  it('gives the dark period as a range before it starts, and as "until" once it has', () => {
    useUiStore.setState({ observer: { lat: 39.1, lon: -94.6, isFallback: false } })
    render(<TonightPanel />)
    expect(screen.getByText(/^\d{2}:\d{2}–\d{2}:\d{2}$/)).toBeTruthy()
    cleanup()
    // 02:14 UTC is 21:14 in Kansas City: dark since about 19:40, not since 21:00.
    state.now = new Date('2026-10-28T02:14:00Z')
    render(<TonightPanel />)
    expect(screen.getByText(/^until \d{2}:\d{2}$/)).toBeTruthy()
  })

  it('asks Open-Meteo for nothing until the location is shared (#79)', () => {
    render(<TonightPanel />)
    expect(clouds.useClouds).toHaveBeenLastCalledWith(null)
  })

  it('shows hourly cloud cover, and says the approximate location goes to Open-Meteo (#79)', () => {
    const start = Math.floor(NOW.getTime() / 3_600_000) * 3600
    clouds.useClouds.mockReturnValue({
      data: {
        hourly: {
          time: Array.from({ length: 12 }, (_, i) => start + i * 3600),
          cloud_cover: [45, 32, 10, 36, 93, 85, 6, 3, 24, 100, 100, null],
        },
      },
    })
    useUiStore.setState({ observer: { lat: 39.1, lon: -94.6, isFallback: false } })
    render(<TonightPanel />)
    const cells = [...document.querySelectorAll('[data-cloud]')].map((c) => c.textContent)
    expect(cells).toEqual(['45', '32', '10', '36', '93', '85', '6', '3', '24', '100', '100', '—'])
    expect(document.body.textContent).toMatch(/approximate location is sent to Open-Meteo/i)
    expect(screen.getByRole('link', { name: /Open-Meteo/ }).getAttribute('href')).toBe(
      'https://open-meteo.com/',
    )
    clouds.useClouds.mockReturnValue({ data: undefined })
  })

  it('names each hour for screen readers, with darkness and the moon', () => {
    useUiStore.setState({ observer: { lat: 39.1, lon: -94.6, isFallback: false } })
    render(<TonightPanel />)
    const first = document.querySelector('[data-darkness]')
    expect(first?.getAttribute('aria-label')).toMatch(/\d{1,2}:00 .*(day|twilight|dark)/i)
  })
})
