/**
 * The Tonight panel (#78): twelve hours of darkness and moon at the user's location.
 * It asks for nothing until the user clicks, and it shares the location with Sun & Moon.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { TonightPanel } from '@/components/panels/TonightPanel'
import type * as GeoModule from '@/hooks/useGeolocation'
import { encodeGrid } from '@/lib/auroraChance'
import { useUiStore } from '@/store/ui'

const NOW = new Date('2026-10-27T22:40:00Z')
const state = vi.hoisted(() => ({ request: vi.fn(), now: new Date('2026-10-27T22:40:00Z') }))

vi.mock('@/hooks/useNow', () => ({ useNow: () => state.now }))
const clouds = vi.hoisted(() => ({
  useClouds: vi.fn<(observer: unknown) => { data: unknown }>(() => ({ data: undefined })),
}))
vi.mock('@/hooks/useClouds', () => clouds)
const sky = vi.hoisted((): { aurora: unknown; cycle: unknown } => ({
  aurora: { data: undefined },
  cycle: { data: undefined },
}))
vi.mock('@/hooks/useAurora', () => ({ useAurora: () => sky.aurora }))
vi.mock('@/hooks/useSolarCycle', () => ({ useSolarCycle: () => sky.cycle }))
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

  describe('aurora chance (#80)', () => {
    // 02:14 UTC is 21:14 in Kansas City, fully dark. An oval from 47 to 60°N at 20% puts
    // aurora on KC's poleward horizon: chance = half of 20 = 10%, times 90% clear sky.
    const DARK = new Date('2026-10-28T02:14:00Z')
    const oval: [number, number, number][] = []
    for (let lon = 0; lon < 360; lon++) {
      for (let lat = -90; lat <= 90; lat++) oval.push([lon, lat, lat >= 47 && lat <= 60 ? 20 : 0])
    }
    const start = Math.floor(DARK.getTime() / 3_600_000) * 3600

    function setUp() {
      state.now = DARK
      sky.aurora = {
        data: {
          points: [],
          grid: encodeGrid(oval),
          observationTime: '2026-10-28T02:05:00Z',
          forecastTime: '2026-10-28T03:00:00Z',
          updatedAt: '',
        },
      }
      sky.cycle = {
        data: {
          kpForecast: [
            { time: '2026-10-28T06:00:00', kp: 2.33, kind: 'predicted', scale: null },
            { time: '2026-10-28T09:00:00', kp: 4.67, kind: 'predicted', scale: null },
            { time: '2026-10-28T12:00:00', kp: 3, kind: 'predicted', scale: null },
          ],
        },
      }
      clouds.useClouds.mockReturnValue({
        data: {
          hourly: {
            time: Array.from({ length: 12 }, (_, i) => start + i * 3600),
            cloud_cover: Array<number>(12).fill(10),
          },
        },
      })
      useUiStore.setState({ observer: { lat: 39.1, lon: -94.6, isFallback: false } })
    }

    afterEach(() => {
      sky.aurora = { data: undefined }
      sky.cycle = { data: undefined }
      clouds.useClouds.mockReturnValue({ data: undefined })
    })

    it('gives the chance now, with what it is made of, and says the weighting is ours', () => {
      setUp()
      render(<TonightPanel />)
      expect(screen.getByText('9%')).toBeTruthy()
      expect(document.body.textContent).toMatch(/overhead 0%/i)
      expect(document.body.textContent).toMatch(/horizon 20%/i)
      expect(document.body.textContent).toMatch(/our estimate/i)
    })

    it("shows OVATION's chance only for its forecast window, then the Kp forecast", () => {
      setUp()
      render(<TonightPanel />)
      const row = [...document.querySelectorAll('[data-aurora]')].map((c) => c.textContent)
      expect(row).toHaveLength(12)
      // 02:00 to 04:00 UTC sit within 2 h of the 03:00 forecast; later hours show Kp.
      expect(row.slice(0, 3)).toEqual(['9', '9', '9'])
      expect(row[4]).toBe('Kp2')
      expect(row[7]).toBe('Kp5')
    })

    it('shows no chance while the sky is too bright for aurora', () => {
      setUp()
      state.now = new Date('2026-10-27T22:40:00Z')
      render(<TonightPanel />)
      const row = [...document.querySelectorAll('[data-aurora]')].map((c) => c.textContent)
      expect(row[0]).toBe('—')
    })
  })

  it('names each hour for screen readers, with darkness and the moon', () => {
    useUiStore.setState({ observer: { lat: 39.1, lon: -94.6, isFallback: false } })
    render(<TonightPanel />)
    const first = document.querySelector('[data-darkness]')
    expect(first?.getAttribute('aria-label')).toMatch(/\d{1,2}:00 .*(day|twilight|dark)/i)
  })
})
